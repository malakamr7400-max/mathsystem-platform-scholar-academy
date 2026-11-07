-- Step 76.3: safe library removal. Run in Supabase SQL Editor AFTER backup.
-- No questions or assessments are physically deleted by these RPCs.
BEGIN;

ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS bank_removed_at timestamptz;
CREATE INDEX IF NOT EXISTS questions_org_bank_removed_idx
  ON public.questions (organization_id, bank_removed_at);

CREATE OR REPLACE FUNCTION public.remove_question_bank_items_safely_v1(p_question_ids uuid[])
RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_org uuid;
  v_ids uuid[];
  v_n integer;
  v_assessment record;
  v_payload jsonb;
  v_has_attempts boolean;
BEGIN
  SELECT organization_id INTO v_org
    FROM public.profiles
    WHERE id = auth.uid() AND lower(coalesce(role, '')) IN ('admin', 'teacher');
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Only a signed-in organization teacher or administrator can remove questions.' USING ERRCODE='42501';
  END IF;
  SELECT coalesce(array_agg(DISTINCT x.id ORDER BY x.id), '{}'::uuid[])
    INTO v_ids FROM unnest(p_question_ids) AS x(id) WHERE x.id IS NOT NULL;
  IF cardinality(v_ids) = 0 THEN RETURN 0; END IF;

  -- Lock/verify all requested rows together; refuse partial multi-deletes.
  PERFORM 1 FROM public.questions q
    WHERE q.id = ANY(v_ids) AND q.organization_id = v_org
      AND q.bank_removed_at IS NULL
    ORDER BY q.id FOR UPDATE;
  SELECT count(*) INTO v_n FROM public.questions q
    WHERE q.id = ANY(v_ids) AND q.organization_id = v_org
      AND q.bank_removed_at IS NULL;
  IF v_n <> cardinality(v_ids) THEN
    RAISE EXCEPTION 'Some questions are missing, already removed, or not accessible. Nothing was changed.' USING ERRCODE='42501';
  END IF;

  -- Lock affected current assessment definitions. Immutable assessment versions
  -- and historical student answers are NEVER changed.
  FOR v_assessment IN
    SELECT a.id, a.payload, a.status
    FROM public.assessments a
    WHERE a.organization_id = v_org
      AND coalesce(jsonb_typeof(a.payload->'sections'), '') = 'array'
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(a.payload->'sections') AS s(item)
        CROSS JOIN LATERAL jsonb_array_elements(
          CASE WHEN jsonb_typeof(s.item->'questions')='array' THEN s.item->'questions' ELSE '[]'::jsonb END
        ) AS q(item)
        WHERE lower(coalesce(q.item->>'questionId', '')) = ANY(
          SELECT id::text FROM unnest(v_ids) AS ids(id)
        )
      )
    ORDER BY a.id FOR UPDATE
  LOOP
    SELECT EXISTS(SELECT 1 FROM public.attempts t WHERE t.assessment_id=v_assessment.id)
      OR EXISTS(
        SELECT 1 FROM public.module_attempts ma
        JOIN public.modules m ON m.id=ma.module_id
        WHERE m.assessment_id=v_assessment.id
      ) INTO v_has_attempts;

    IF v_has_attempts THEN
      -- Keep the old payload as historical context; stop new participation.
      -- This assessment is archived and hidden from the active library.
      UPDATE public.assessments SET status='archived', updated_at=now()
        WHERE id=v_assessment.id AND organization_id=v_org;
    ELSE
      v_payload := public.strip_question_ids_from_payload_v1(v_assessment.payload, v_ids);
      -- An altered published assessment must be republished to create a new
      -- immutable version. Never silently keep its old published link live.
      UPDATE public.assessments
        SET payload=v_payload,
            status=CASE WHEN status='published' THEN 'draft' ELSE status END,
            updated_at=now()
      WHERE id=v_assessment.id AND organization_id=v_org;
    END IF;
  END LOOP;

  UPDATE public.questions SET bank_removed_at=now(), updated_at=now()
    WHERE id=ANY(v_ids) AND organization_id=v_org AND bank_removed_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> cardinality(v_ids) THEN
    RAISE EXCEPTION 'Removal was incomplete; operation rolled back.';
  END IF;
  RETURN v_n;
END;
$function$;

CREATE OR REPLACE FUNCTION public.remove_assessment_from_library_safely_v1(p_assessment_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_org uuid;
  v_existing public.assessments%ROWTYPE;
BEGIN
  SELECT organization_id INTO v_org
    FROM public.profiles
    WHERE id=auth.uid() AND lower(coalesce(role, '')) IN ('admin', 'teacher');
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Only a signed-in organization teacher or administrator can remove assessments.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_existing FROM public.assessments
    WHERE id=p_assessment_id AND organization_id=v_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Assessment not found or unavailable.' USING ERRCODE='42501'; END IF;
  IF coalesce(v_existing.payload->>'removedFromLibrary', 'false')='true' THEN
    RAISE EXCEPTION 'This assessment has already been removed from the library.';
  END IF;
  UPDATE public.assessments
    SET status='archived',
        payload=jsonb_set(coalesce(payload,'{}'::jsonb), '{removedFromLibrary}', 'true'::jsonb, true),
        updated_at=now()
    WHERE id=p_assessment_id AND organization_id=v_org;
  -- Leave questions, versions, attempts, and reports untouched.
  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.remove_question_bank_items_safely_v1(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remove_assessment_from_library_safely_v1(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remove_question_bank_items_safely_v1(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_assessment_from_library_safely_v1(uuid) TO authenticated;
COMMIT;
