-- Step 65.8: pin a published Studio snapshot to each NEWLY completed attempt.
-- Run after Step 65.6. Does not retroactively modify historical attempts.
-- Assumes public.attempts has id, organization_id, assessment_id, status, resume_token.
-- Organization config key convention follows Step 65.6.
BEGIN;
CREATE TABLE IF NOT EXISTS public.attempt_studio_report_snapshots (
  attempt_id uuid PRIMARY KEY REFERENCES public.attempts(id) ON DELETE CASCADE,
  studio_template jsonb NOT NULL,
  pinned_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT valid_studio_snapshot CHECK (
    jsonb_typeof(studio_template) = 'object'
    AND studio_template->>'schemaVersion' = '1'
    AND jsonb_typeof(studio_template #> '{layout,elements}') = 'array'
  )
);
ALTER TABLE public.attempt_studio_report_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.attempt_studio_report_snapshots FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.pin_studio_template_on_completion_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_pointer jsonb;
  v_template jsonb;
  v_key text;
BEGIN
  IF NEW.status <> 'completed' OR (TG_OP = 'UPDATE' AND OLD.status = 'completed') THEN
    RETURN NEW;
  END IF;
  -- Do not pin an unverified pointer or a template from another organization.
  SELECT c.config_data INTO v_pointer
  FROM public.organization_app_configs c
  WHERE c.organization_id = NEW.organization_id
    AND c.assessment_id IS NULL
    AND c.config_key = 'report-studio.published.v1'
  LIMIT 1;
  v_key := v_pointer->>'versionKey';
  IF v_key IS NULL OR v_key !~ '^report-studio\.version\.[a-f0-9-]{36}$' THEN
    RETURN NEW;
  END IF;
  SELECT c.config_data INTO v_template
  FROM public.organization_app_configs c
  WHERE c.organization_id = NEW.organization_id
    AND c.assessment_id IS NULL
    AND c.config_key = v_key
  LIMIT 1;
  IF v_template IS NULL OR v_template->>'schemaVersion' <> '1'
     OR jsonb_typeof(v_template #> '{layout,elements}') IS DISTINCT FROM 'array' THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.attempt_studio_report_snapshots (attempt_id, studio_template)
  VALUES (NEW.id, v_template)
  ON CONFLICT (attempt_id) DO NOTHING;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS pin_studio_template_on_completion_v1 ON public.attempts;
CREATE TRIGGER pin_studio_template_on_completion_v1
AFTER INSERT OR UPDATE OF status ON public.attempts
FOR EACH ROW EXECUTE FUNCTION public.pin_studio_template_on_completion_v1();

CREATE OR REPLACE FUNCTION public.get_student_studio_template_v1(
  p_attempt_id uuid, p_resume_token text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_template jsonb;
BEGIN
  IF p_resume_token IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.attempts a
    WHERE a.id = p_attempt_id
      AND a.resume_token = p_resume_token
      AND a.status = 'completed'
  ) THEN
    RAISE EXCEPTION 'Completed attempt and valid token required.' USING ERRCODE = '42501';
  END IF;
  SELECT s.studio_template INTO v_template
  FROM public.attempt_studio_report_snapshots s WHERE s.attempt_id = p_attempt_id;
  RETURN v_template;
END;
$$;
REVOKE ALL ON FUNCTION public.pin_studio_template_on_completion_v1() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_student_studio_template_v1(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_student_studio_template_v1(uuid,text) TO anon, authenticated;
COMMIT;
