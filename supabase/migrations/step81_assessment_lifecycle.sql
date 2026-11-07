-- Step 81. Apply on staging after backup and dependency review.
-- Restoring never re-publishes an assessment; it returns as a draft.
BEGIN;
CREATE OR REPLACE FUNCTION public.restore_assessment_to_library_v1(p_assessment_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE v_org uuid; v_row public.assessments%ROWTYPE;
BEGIN
  SELECT organization_id INTO v_org FROM public.profiles
  WHERE id=auth.uid() AND lower(coalesce(role,'')) IN ('admin','teacher');
  IF v_org IS NULL THEN RAISE EXCEPTION 'Teacher or admin access required' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_row FROM public.assessments
  WHERE id=p_assessment_id AND organization_id=v_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Assessment not found or unavailable' USING ERRCODE='42501'; END IF;
  IF v_row.status <> 'archived' THEN RAISE EXCEPTION 'Only archived assessments can be restored'; END IF;
  UPDATE public.assessments SET status='draft',
    payload=coalesce(payload,'{}'::jsonb)-'removedFromLibrary', updated_at=now()
  WHERE id=p_assessment_id AND organization_id=v_org;
  RETURN true;
END $$;

-- SECURITY DEFINER is necessary to inspect all FK dependencies despite RLS.
-- Deploy with a trusted database owner; explicit org/admin authorization is enforced.
-- Strictly non-cascading. Refuse deletion if student submissions exist;
-- other foreign-key dependencies will also block deletion atomically.
CREATE OR REPLACE FUNCTION public.permanently_delete_unused_assessment_v1(p_assessment_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_org uuid; v_row public.assessments%ROWTYPE; v_count bigint; v_fk record;
BEGIN
  SELECT organization_id INTO v_org FROM public.profiles
  WHERE id=auth.uid() AND lower(coalesce(role,''))='admin';
  IF v_org IS NULL THEN RAISE EXCEPTION 'Administrator access required for permanent deletion' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_row FROM public.assessments
  WHERE id=p_assessment_id AND organization_id=v_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Assessment not found or unavailable' USING ERRCODE='42501'; END IF;
  IF v_row.status <> 'archived' THEN RAISE EXCEPTION 'Archive the assessment before permanently deleting it'; END IF;
  SELECT count(*) INTO v_count FROM public.attempts WHERE assessment_id=p_assessment_id;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'Cannot delete: % student attempt(s) are still linked. Preserve or review them first.', v_count;
  END IF;
  -- Inspect every FK pointing at assessments, including ON DELETE CASCADE.
  -- Refuse if ANY referencing row exists rather than allowing implicit cascades.
  FOR v_fk IN
    SELECT con.conname, con.conrelid::regclass AS child_table,
           att.attname AS child_column, cardinality(con.conkey) AS key_size
    FROM pg_constraint con
    LEFT JOIN pg_attribute att ON att.attrelid=con.conrelid AND att.attnum=con.conkey[1]
    WHERE con.contype='f' AND con.confrelid='public.assessments'::regclass
  LOOP
    IF v_fk.key_size <> 1 OR v_fk.child_column IS NULL THEN
      RAISE EXCEPTION 'Cannot delete: composite or unknown dependency (%) requires review', v_fk.conname;
    END IF;
    EXECUTE format('SELECT count(*) FROM %s WHERE %I = $1', v_fk.child_table, v_fk.child_column)
      INTO v_count USING p_assessment_id;
    IF v_count > 0 THEN
      RAISE EXCEPTION 'Cannot delete: % related row(s) in % must be reviewed first', v_count, v_fk.child_table;
    END IF;
  END LOOP;
  -- Restrict to dependency-free, archived rows; any additional trigger or
  -- constraint error rolls back the entire transaction.
  DELETE FROM public.assessments WHERE id=p_assessment_id AND organization_id=v_org;
  IF NOT FOUND THEN RAISE EXCEPTION 'Assessment was not deleted'; END IF;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.restore_assessment_to_library_v1(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.permanently_delete_unused_assessment_v1(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restore_assessment_to_library_v1(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.permanently_delete_unused_assessment_v1(uuid) TO authenticated;
COMMIT;
