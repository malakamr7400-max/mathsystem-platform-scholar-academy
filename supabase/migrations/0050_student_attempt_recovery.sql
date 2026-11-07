-- MathSystem Step 78: token-protected server draft recovery.
-- Apply AFTER Step 59 / 0049. BACK UP first. This adds a separate recovery table.
-- It does not rewrite existing attempts, immutable versions, answers or reports.
BEGIN;
DO $$ BEGIN
 IF to_regclass('public.attempts') IS NULL OR to_regclass('public.assessment_versions_v1') IS NULL
 OR to_regprocedure('public.submit_student_attempt_v1(uuid,uuid,jsonb)') IS NULL THEN
  RAISE EXCEPTION 'Step 78 prerequisites missing';
 END IF;
END $$;
CREATE TABLE IF NOT EXISTS public.student_attempt_recovery_v1 (
 attempt_id uuid PRIMARY KEY REFERENCES public.attempts(id) ON DELETE CASCADE,
 answers jsonb NOT NULL DEFAULT '{}'::jsonb,
 position jsonb NOT NULL DEFAULT '{}'::jsonb,
 revision bigint NOT NULL DEFAULT 0,
 section_index integer NOT NULL DEFAULT 0,
 section_started_at timestamptz,
 section_deadline timestamptz,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CONSTRAINT recovery_answers_object CHECK (jsonb_typeof(answers) = 'object'),
 CONSTRAINT recovery_position_object CHECK (jsonb_typeof(position) = 'object'),
 CONSTRAINT recovery_nonnegative_revision CHECK (revision >= 0),
 CONSTRAINT recovery_nonnegative_section CHECK (section_index >= 0)
);
ALTER TABLE public.student_attempt_recovery_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.student_attempt_recovery_v1 FROM PUBLIC, anon, authenticated;

-- PRIVATE helper, always called with row-locked attempt. Result is server-derived.
CREATE FUNCTION public.student_attempt_deadline_v1(p_attempt public.attempts, p_payload jsonb)
RETURNS timestamptz LANGUAGE plpgsql STABLE SET search_path = public, pg_temp AS $$
DECLARE v_minutes numeric;
BEGIN
 IF p_payload #>> '{settings,timerMode}' = 'per_assessment' THEN
   v_minutes := NULLIF(p_payload #>> '{settings,timerMinutes}', '')::numeric;
   IF v_minutes IS NULL OR v_minutes <= 0 OR v_minutes > 1440 THEN
     RAISE EXCEPTION 'Invalid pinned assessment timer' USING ERRCODE='22023';
   END IF;
   RETURN p_attempt.started_at + (v_minutes * interval '1 minute');
 END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.student_attempt_deadline_v1(public.attempts,jsonb) FROM PUBLIC, anon, authenticated;

-- Returns recovery state. No client-provided deadline can extend timing.
CREATE FUNCTION public.get_student_attempt_recovery_v1(p_attempt_id uuid, p_resume_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE a public.attempts%ROWTYPE; v public.assessment_versions_v1%ROWTYPE;
 d public.student_attempt_recovery_v1%ROWTYPE; deadline timestamptz; now_at timestamptz := clock_timestamp();
 sec jsonb; section_count integer; minutes numeric;
BEGIN
 SELECT * INTO a FROM public.attempts WHERE id=p_attempt_id FOR UPDATE;
 IF NOT FOUND OR p_resume_token IS NULL OR a.resume_token IS DISTINCT FROM p_resume_token THEN
  RAISE EXCEPTION 'Invalid attempt or token' USING ERRCODE='42501';
 END IF;
 IF a.assessment_version_id IS NULL THEN RAISE EXCEPTION 'Versioned attempt required' USING ERRCODE='22023'; END IF;
 SELECT * INTO v FROM public.assessment_versions_v1 WHERE id=a.assessment_version_id AND assessment_id=a.assessment_id AND organization_id=a.organization_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Pinned version missing' USING ERRCODE='22023'; END IF;
 deadline := public.student_attempt_deadline_v1(a, v.payload);
 section_count := jsonb_array_length(v.payload->'sections');
 INSERT INTO public.student_attempt_recovery_v1(attempt_id,section_started_at,section_deadline)
 VALUES (a.id,a.started_at,
  CASE WHEN COALESCE(v.payload #>> '{settings,timerMode}','') <> 'per_assessment'
    AND COALESCE((v.payload #> '{sections,0,settings}' ->> 'timingEnabled')::boolean,false)
    AND NOT COALESCE((v.payload #> '{sections,0,settings}' ->> 'optional')::boolean,false)
   THEN a.started_at + (COALESCE((v.payload #> '{sections,0,settings}' ->> 'timeLimitMinutes')::numeric,0) * interval '1 minute')
   ELSE NULL END)
 ON CONFLICT (attempt_id) DO NOTHING;
 SELECT * INTO d FROM public.student_attempt_recovery_v1 WHERE attempt_id=a.id FOR UPDATE;
 -- If a student was away past the active section deadline, do not restart it.
 -- Advance over elapsed mandatory sections, anchoring each next section at the previous deadline.
 IF deadline IS NULL AND a.status='in_progress' THEN
  WHILE d.section_deadline IS NOT NULL AND now_at >= d.section_deadline AND d.section_index < section_count - 1 LOOP
   d.section_started_at := d.section_deadline;
   d.section_index := d.section_index + 1;
   sec := v.payload->'sections'->d.section_index;
   IF COALESCE((sec #>> '{settings,optional}')::boolean,false) THEN
    d.section_deadline := NULL; -- optional sections await explicit start
   ELSIF COALESCE((sec #>> '{settings,timingEnabled}')::boolean,false) THEN
    minutes := COALESCE((sec #>> '{settings,timeLimitMinutes}')::numeric,0);
    IF minutes <= 0 OR minutes > 1440 THEN RAISE EXCEPTION 'Invalid section timer' USING ERRCODE='22023'; END IF;
    d.section_deadline := d.section_started_at + minutes * interval '1 minute';
   ELSE d.section_deadline := NULL; END IF;
   d.position := jsonb_build_object('sectionIndex',d.section_index,'questionIndex',0,'flaggedQuestionIds','[]'::jsonb,'onBreak',false);
  END LOOP;
  UPDATE public.student_attempt_recovery_v1 SET section_index=d.section_index,section_started_at=d.section_started_at,section_deadline=d.section_deadline,position=d.position WHERE attempt_id=a.id;
 END IF;
 RETURN jsonb_build_object('status',a.status,'answers',d.answers,'position',d.position,'revision',d.revision,
 'serverNow',now_at,'overallDeadline',deadline,'sectionDeadline',d.section_deadline,
 'sectionIndex',d.section_index,'expired', (deadline IS NOT NULL AND now_at >= deadline)
  OR (deadline IS NULL AND d.section_index=section_count-1 AND d.section_deadline IS NOT NULL AND now_at >= d.section_deadline));
END $$;
REVOKE ALL ON FUNCTION public.get_student_attempt_recovery_v1(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_student_attempt_recovery_v1(uuid,uuid) TO anon,authenticated;

CREATE FUNCTION public.save_student_attempt_recovery_v1(
 p_attempt_id uuid,p_resume_token uuid,p_answers jsonb,p_position jsonb,p_expected_revision bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE a public.attempts%ROWTYPE; v public.assessment_versions_v1%ROWTYPE;
 d public.student_attempt_recovery_v1%ROWTYPE; max_section integer; next_section integer;
 deadline timestamptz; now_at timestamptz := clock_timestamp(); item jsonb; mins numeric;
BEGIN
 SELECT * INTO a FROM public.attempts WHERE id=p_attempt_id FOR UPDATE;
 IF NOT FOUND OR p_resume_token IS NULL OR a.resume_token IS DISTINCT FROM p_resume_token THEN
  RAISE EXCEPTION 'Invalid attempt or token' USING ERRCODE='42501'; END IF;
 IF a.status <> 'in_progress' THEN RAISE EXCEPTION 'Attempt is not active' USING ERRCODE='23514'; END IF;
 SELECT * INTO v FROM public.assessment_versions_v1 WHERE id=a.assessment_version_id AND assessment_id=a.assessment_id AND organization_id=a.organization_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Pinned version missing' USING ERRCODE='22023'; END IF;
 deadline := public.student_attempt_deadline_v1(a,v.payload);
 IF deadline IS NOT NULL AND now_at >= deadline THEN RAISE EXCEPTION 'Exam time has expired' USING ERRCODE='23514'; END IF;
 IF jsonb_typeof(p_answers) IS DISTINCT FROM 'object' OR pg_column_size(p_answers)>131072
  OR jsonb_typeof(p_position) IS DISTINCT FROM 'object' OR pg_column_size(p_position)>16384 THEN
  RAISE EXCEPTION 'Invalid recovery payload' USING ERRCODE='22023'; END IF;
 IF EXISTS (SELECT 1 FROM jsonb_each(p_answers) x WHERE
   jsonb_typeof(x.value) NOT IN ('string','number','null') OR
   length(x.value::text)>4096 OR
   NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v.payload->'sections') s,
     LATERAL jsonb_array_elements(s->'questions') q WHERE q->>'id'=x.key)) THEN
   RAISE EXCEPTION 'Invalid answer or unknown question ID' USING ERRCODE='22023'; END IF;
 INSERT INTO public.student_attempt_recovery_v1(attempt_id) VALUES(a.id) ON CONFLICT DO NOTHING;
 SELECT * INTO d FROM public.student_attempt_recovery_v1 WHERE attempt_id=a.id FOR UPDATE;
 IF p_expected_revision IS DISTINCT FROM d.revision THEN
  RAISE EXCEPTION 'Recovery revision conflict; reload latest saved answers' USING ERRCODE='40001'; END IF;
 max_section := jsonb_array_length(v.payload->'sections')-1;
 next_section := COALESCE((p_position->>'sectionIndex')::integer,d.section_index);
 IF next_section < d.section_index OR next_section > d.section_index+1 OR next_section>max_section THEN
  RAISE EXCEPTION 'Invalid section transition' USING ERRCODE='22023'; END IF;
 IF d.section_deadline IS NOT NULL AND now_at >= d.section_deadline THEN
  RAISE EXCEPTION 'Section time has expired; reload to advance' USING ERRCODE='23514'; END IF;
 IF next_section>d.section_index THEN
  -- Timer starts on the SERVER. Clients cannot select an arbitrary deadline.
  d.section_started_at:=now_at;
  item:=v.payload->'sections'->next_section;
  IF COALESCE((item #>> '{settings,timingEnabled}')::boolean,false)
      AND NOT COALESCE((item #>> '{settings,optional}')::boolean,false) THEN
    mins:=COALESCE((item #>> '{settings,timeLimitMinutes}')::numeric,0);
    IF mins<=0 OR mins>1440 THEN RAISE EXCEPTION 'Invalid section duration' USING ERRCODE='22023'; END IF;
    d.section_deadline:= now_at + mins*interval '1 minute';
  ELSE d.section_deadline:=NULL; END IF;
  d.section_index:=next_section;
 END IF;
 -- Optional timed section starts at first accepted answer within that section.
 IF d.section_deadline IS NULL AND d.section_index=next_section AND
    COALESCE((v.payload->'sections'->next_section #>> '{settings,optional}')::boolean,false) AND
    COALESCE((v.payload->'sections'->next_section #>> '{settings,timingEnabled}')::boolean,false) AND
    EXISTS (SELECT 1 FROM jsonb_each(p_answers) x JOIN LATERAL jsonb_array_elements(v.payload->'sections'->next_section->'questions') q ON q->>'id'=x.key) THEN
   mins:=COALESCE((v.payload->'sections'->next_section #>> '{settings,timeLimitMinutes}')::numeric,0);
   IF mins<=0 OR mins>1440 THEN RAISE EXCEPTION 'Invalid section duration' USING ERRCODE='22023'; END IF;
   d.section_deadline:=now_at+mins*interval '1 minute';
 END IF;
 UPDATE public.student_attempt_recovery_v1 SET answers=p_answers,position=p_position,revision=d.revision+1,
  section_index=d.section_index,section_started_at=d.section_started_at,section_deadline=d.section_deadline,updated_at=now_at
 WHERE attempt_id=a.id;
 RETURN jsonb_build_object('revision',d.revision+1,'savedAt',now_at,'sectionDeadline',d.section_deadline,'sectionIndex',d.section_index);
END $$;
REVOKE ALL ON FUNCTION public.save_student_attempt_recovery_v1(uuid,uuid,jsonb,jsonb,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_student_attempt_recovery_v1(uuid,uuid,jsonb,jsonb,bigint) TO anon,authenticated;

-- Retain the existing, extensively-tested scoring implementation as a PRIVATE function.
-- Interpose deadline enforcement without rewriting the scoring algorithm.
ALTER FUNCTION public.submit_student_attempt_v1(uuid,uuid,jsonb) RENAME TO submit_student_attempt_scoring_private_v1;
REVOKE ALL ON FUNCTION public.submit_student_attempt_scoring_private_v1(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.submit_student_attempt_v1(p_attempt_id uuid,p_resume_token uuid,p_answers jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE a public.attempts%ROWTYPE; v public.assessment_versions_v1%ROWTYPE;
 d public.student_attempt_recovery_v1%ROWTYPE; deadline timestamptz; effective_answers jsonb;
 now_at timestamptz:=clock_timestamp(); end_section timestamptz; sec_count integer;
BEGIN
 SELECT * INTO a FROM public.attempts WHERE id=p_attempt_id FOR UPDATE;
 IF NOT FOUND OR p_resume_token IS NULL OR a.resume_token IS DISTINCT FROM p_resume_token THEN
  RAISE EXCEPTION 'Invalid attempt or token' USING ERRCODE='42501'; END IF;
 IF a.status='completed' THEN
  RETURN public.submit_student_attempt_scoring_private_v1(p_attempt_id,p_resume_token,COALESCE(p_answers,'{}'::jsonb));
 END IF;
 IF a.status<>'in_progress' THEN RAISE EXCEPTION 'Attempt not active' USING ERRCODE='23514'; END IF;
 SELECT * INTO v FROM public.assessment_versions_v1 WHERE id=a.assessment_version_id AND assessment_id=a.assessment_id AND organization_id=a.organization_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Pinned version missing' USING ERRCODE='22023'; END IF;
 deadline:=public.student_attempt_deadline_v1(a,v.payload);
 SELECT * INTO d FROM public.student_attempt_recovery_v1 WHERE attempt_id=a.id FOR UPDATE;
 sec_count:=jsonb_array_length(v.payload->'sections');
 end_section:=d.section_deadline;
 IF deadline IS NOT NULL AND now_at>=deadline THEN
  -- Late browser submissions never overwrite answers saved before the deadline.
  effective_answers:=COALESCE(d.answers,'{}'::jsonb);
 ELSIF deadline IS NULL AND end_section IS NOT NULL AND d.section_index=sec_count-1 AND now_at>=end_section THEN
  effective_answers:=COALESCE(d.answers,'{}'::jsonb);
 ELSE
  effective_answers:=p_answers;
 END IF;
 RETURN public.submit_student_attempt_scoring_private_v1(p_attempt_id,p_resume_token,effective_answers);
END $$;
REVOKE ALL ON FUNCTION public.submit_student_attempt_v1(uuid,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_student_attempt_v1(uuid,uuid,jsonb) TO anon,authenticated;
COMMIT;
