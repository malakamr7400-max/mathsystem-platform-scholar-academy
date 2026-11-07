-- Step 59: version-pinned standard/SAT/ACT/EST practice scoring.
-- Apply AFTER 0047 and 0048; stage first, back up database.
-- Existing attempts and immutable assessment versions are NEVER updated.
-- No official conversion tables are bundled: defaults are labeled practice estimates.
BEGIN;
DO $preflight$ BEGIN
  IF to_regprocedure('public.submit_student_attempt_v1(uuid,uuid,jsonb)') IS NULL
     OR to_regclass('public.assessment_versions_v1') IS NULL
     OR to_regprocedure('public.parse_assessment_numeric_v1(text)') IS NULL THEN
    RAISE EXCEPTION 'Step 59 requires Step 34 server-authoritative scoring and immutable versions.';
  END IF;
END $preflight$;

-- Compute report-only scaled practice estimates from the immutable assessment
-- payload and server-graded question evidence. Never use student-supplied scores.
-- Default exam conversions are intentionally NOT represented as official tables.
CREATE FUNCTION public.compute_assessment_scoring_v1(p_payload jsonb, p_report jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
DECLARE
  v_config jsonb := COALESCE(p_payload #> '{settings,scoring}', '{}'::jsonb);
  v_scheme text := COALESCE(p_payload #>> '{settings,scoring,scheme}', 'standard');
  v_mode text := COALESCE(p_payload #>> '{settings,scoring,mode}', 'default');
  v_sections jsonb := '[]'::jsonb;
  v_section jsonb;
  v_cfg jsonb;
  v_q record;
  v_id text;
  v_title text;
  v_role text;
  v_min numeric;
  v_max numeric;
  v_correct integer;
  v_total integer;
  v_earned numeric;
  v_possible numeric;
  v_scaled numeric;
  v_include boolean;
  v_method text;
  v_table jsonb;
  v_match jsonb;
  v_composite numeric := 0;
  v_comp_count integer := 0;
  v_comp_missing boolean := false;
  v_math boolean := false;
  v_verbal boolean := false;
  v_english boolean := false;
  v_reading boolean := false;
  v_comp_result numeric;
  v_comp_label text;
  v_note text;
BEGIN
  IF v_scheme NOT IN ('standard','sat','act','est') THEN
    RAISE EXCEPTION 'Unknown assessment scoring scheme: %', v_scheme USING ERRCODE='22023';
  END IF;
  IF v_mode NOT IN ('default','custom') THEN
    RAISE EXCEPTION 'Invalid assessment scoring mode.' USING ERRCODE='22023';
  END IF;
  IF v_scheme = 'standard' THEN
    RETURN jsonb_build_object('scheme','standard','mode','default','label','Points and percentage',
      'raw_correct', p_report #> '{overall,correct_count}',
      'raw_total', p_report #> '{overall,total_questions}',
      'points_earned', p_report #> '{overall,points_earned}',
      'points_possible', p_report #> '{overall,points_possible}',
      'percentage', p_report #> '{overall,percentage}',
      'sections', '[]'::jsonb, 'composite', NULL, 'composite_label', NULL,
      'conversion_note','Standard grading: saved earned points divided by possible points.');
  END IF;
  IF jsonb_typeof(p_payload -> 'sections') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Missing assessment sections for scoring.' USING ERRCODE='22023';
  END IF;
  FOR v_section IN SELECT value FROM jsonb_array_elements(p_payload -> 'sections') LOOP
    v_id := v_section ->> 'id';
    v_title := COALESCE(NULLIF(v_section ->> 'title',''), 'Section');
    SELECT COUNT(*)::integer, COALESCE(SUM(CASE WHEN (q.value ->> 'is_correct')::boolean THEN 1 ELSE 0 END),0)::integer,
      COALESCE(SUM((q.value ->> 'points_earned')::numeric),0),
      COALESCE(SUM((q.value ->> 'points_possible')::numeric),0)
    INTO v_total,v_correct,v_earned,v_possible
    FROM jsonb_array_elements(p_report -> 'questions') q(value)
    WHERE q.value ->> 'section_id' = v_id;
    v_cfg := NULL;
    IF v_mode = 'custom' AND jsonb_typeof(v_config -> 'sections') = 'array' THEN
      SELECT x.value INTO v_cfg FROM jsonb_array_elements(v_config -> 'sections') x(value)
      WHERE x.value ->> 'sectionId' = v_id LIMIT 1;
    END IF;
    v_role := v_cfg ->> 'role';
    IF v_role IS NULL THEN
      v_role := CASE WHEN v_title ~* '(math|quantitative|algebra|geometry)' THEN 'math'
        WHEN v_title ~* 'science' THEN 'science'
        WHEN v_scheme IN ('sat','est') AND v_title ~* '(reading|writing|english|verbal|literacy)' THEN 'reading_writing'
        WHEN v_scheme = 'act' AND v_title ~* '(english|grammar)' THEN 'english'
        WHEN v_scheme = 'act' AND v_title ~* 'reading' THEN 'reading'
        ELSE 'other' END;
    END IF;
    IF v_role NOT IN ('math','reading_writing','english','reading','science','other') THEN
      RAISE EXCEPTION 'Invalid scoring section role.' USING ERRCODE='22023';
    END IF;
    v_min := CASE WHEN v_scheme = 'act' THEN 1 ELSE 200 END;
    v_max := CASE WHEN v_scheme = 'act' THEN 36 ELSE 800 END;
    IF v_cfg IS NOT NULL THEN
      IF jsonb_typeof(v_cfg -> 'minScaled') = 'number' THEN v_min := (v_cfg ->> 'minScaled')::numeric; END IF;
      IF jsonb_typeof(v_cfg -> 'maxScaled') = 'number' THEN v_max := (v_cfg ->> 'maxScaled')::numeric; END IF;
    END IF;
    IF v_min < 0 OR v_max > 2000 OR v_max <= v_min THEN
      RAISE EXCEPTION 'Invalid scoring scale in section %.', v_title USING ERRCODE='22023';
    END IF;
    v_include := CASE WHEN v_cfg IS NOT NULL THEN COALESCE((v_cfg ->> 'includeInComposite')::boolean,false)
      WHEN v_scheme = 'act' THEN v_role IN ('english','math','reading')
      ELSE v_role IN ('math','reading_writing') END;
    v_table := v_cfg -> 'conversionTable';
    v_scaled := NULL;
    v_method := 'not_available';
    IF v_total > 0 THEN
      IF jsonb_typeof(v_table) = 'array' AND jsonb_array_length(v_table) > 0 THEN
        SELECT x.value INTO v_match FROM jsonb_array_elements(v_table) x(value)
        WHERE x.value ->> 'raw' = v_correct::text LIMIT 1;
        IF v_match IS NOT NULL AND jsonb_typeof(v_match -> 'scaled') = 'number' THEN
          v_scaled := (v_match ->> 'scaled')::numeric;
          IF v_scaled < v_min OR v_scaled > v_max THEN
            RAISE EXCEPTION 'Conversion table score is outside section scale.' USING ERRCODE='22023';
          END IF;
          v_method := 'custom_exact_table';
        END IF;
      ELSE
        v_scaled := v_min + round((v_max - v_min) * v_correct::numeric / v_total);
        v_method := CASE WHEN v_cfg IS NULL THEN 'practice_linear_estimate' ELSE 'custom_linear_estimate' END;
      END IF;
    END IF;
    IF v_include THEN
      v_comp_count := v_comp_count + 1;
      IF v_scaled IS NULL THEN v_comp_missing := true;
      ELSE v_composite := v_composite + v_scaled; END IF;
      IF v_role = 'math' THEN v_math := true; END IF;
      IF v_role = 'reading_writing' THEN v_verbal := true; END IF;
      IF v_role = 'english' THEN v_english := true; END IF;
      IF v_role = 'reading' THEN v_reading := true; END IF;
    END IF;
    v_sections := v_sections || jsonb_build_array(jsonb_build_object(
      'section_id',v_id,'section_title',v_title,'role',v_role,
      'raw_correct',v_correct,'raw_total',v_total,'points_earned',v_earned,
      'points_possible',v_possible,'scaled_score',v_scaled,'scale_min',v_min,'scale_max',v_max,
      'conversion_method',v_method,'include_in_composite',v_include));
  END LOOP;
  v_comp_result := NULL;
  v_comp_label := NULL;
  IF v_mode = 'custom' AND v_comp_count > 0 AND NOT v_comp_missing THEN
    v_comp_result := CASE WHEN v_scheme = 'act' THEN round(v_composite/v_comp_count) ELSE v_composite END;
    v_comp_label := 'Custom composite';
  ELSIF v_mode = 'default' AND NOT v_comp_missing THEN
    IF v_scheme = 'act' AND v_comp_count = 3 AND v_english AND v_math AND v_reading THEN
      v_comp_result := round(v_composite/3); v_comp_label := 'ACT-style practice composite';
    ELSIF v_scheme IN ('sat','est') AND v_comp_count = 2 AND v_math AND v_verbal THEN
      v_comp_result := v_composite; v_comp_label := upper(v_scheme) || '-style practice total';
    END IF;
  END IF;
  v_note := CASE WHEN v_mode = 'custom' THEN
    'Custom per-assessment conversions. With an exact table, unmapped raw counts show N/A; sections without a table use a linear practice estimate. Not an official exam score.'
    ELSE 'Default linear practice estimate only, NOT an official raw-to-scaled conversion. Real SAT, ACT and EST forms require their applicable conversion/equating rules.' END;
  RETURN jsonb_build_object('scheme',v_scheme,'mode',v_mode,
    'label',upper(v_scheme)||' practice scoring',
    'raw_correct', p_report #> '{overall,correct_count}',
    'raw_total', p_report #> '{overall,total_questions}',
    'points_earned', p_report #> '{overall,points_earned}',
    'points_possible', p_report #> '{overall,points_possible}',
    'percentage', p_report #> '{overall,percentage}',
    'sections',v_sections,'composite',v_comp_result,'composite_label',v_comp_label,
    'conversion_note',v_note);
END;
$$;
REVOKE ALL ON FUNCTION public.compute_assessment_scoring_v1(jsonb,jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.submit_student_attempt_v1(
  p_attempt_id uuid,
  p_resume_token uuid,
  p_answers jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_attempt public.attempts%ROWTYPE;
  v_version public.assessment_versions_v1%ROWTYPE;
  v_registration jsonb := '{}'::jsonb;
  v_question jsonb;
  v_section jsonb;
  v_assignment jsonb;
  v_key text;
  v_answer jsonb;
  v_choices jsonb;
  v_type text;
  v_correct_index integer;
  v_selected_index integer;
  v_correct_count integer := 0;
  v_total_count integer := 0;
  v_unanswered_count integer := 0;
  v_possible numeric := 0;
  v_earned numeric := 0;
  v_points numeric;
  v_is_correct boolean;
  v_is_unanswered boolean;
  v_numeric_key numeric;
  v_numeric_answer numeric;
  v_tolerance numeric;
  v_percentage numeric;
  v_completed_at timestamptz;
  v_duration integer;
  v_questions_report jsonb := '[]'::jsonb;
  v_breakdowns jsonb := '[]'::jsonb;
  v_domain_stats jsonb := '{}'::jsonb;
  v_domain text;
  v_stats jsonb;
  v_report jsonb;
  v_expected_count integer;
  v_entry record;
BEGIN
  IF p_attempt_id IS NULL OR p_resume_token IS NULL OR
     jsonb_typeof(p_answers) IS DISTINCT FROM 'object' OR
     pg_column_size(p_answers) > 131072 THEN
    RAISE EXCEPTION 'Valid attempt, token and answer object are required.' USING ERRCODE = '22023';
  END IF;

  -- Row lock serializes concurrent submissions, ensuring one final result.
  SELECT * INTO v_attempt FROM public.attempts WHERE id = p_attempt_id FOR UPDATE;
  IF NOT FOUND OR v_attempt.resume_token IS DISTINCT FROM p_resume_token THEN
    RAISE EXCEPTION 'Attempt not found or resume token is invalid.' USING ERRCODE = '42501';
  END IF;
  IF v_attempt.assessment_version_id IS NULL THEN
    RAISE EXCEPTION 'Legacy unversioned attempts cannot be server-graded. Start a new attempt.' USING ERRCODE = '22023';
  END IF;
  IF v_attempt.status = 'completed' THEN
    -- Idempotent retry after an interrupted network response; never re-grade.
    RETURN jsonb_build_object('id', v_attempt.id, 'status', 'completed',
      'percentage', v_attempt.percentage, 'correct_count', v_attempt.correct_count,
      'total_questions', v_attempt.total_questions,
      'completed_at', v_attempt.completed_at, 'already_completed', true);
  END IF;
  IF v_attempt.status <> 'in_progress' THEN
    RAISE EXCEPTION 'This attempt is not active.' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO STRICT v_version FROM public.assessment_versions_v1
  WHERE id = v_attempt.assessment_version_id
    AND assessment_id = v_attempt.assessment_id
    AND organization_id = v_attempt.organization_id;

  SELECT COALESCE(responses, '{}'::jsonb) INTO v_registration
  FROM public.registration_responses WHERE attempt_id = v_attempt.id;
  v_registration := COALESCE(v_registration, '{}'::jsonb);

  SELECT count(*) INTO v_expected_count
  FROM jsonb_array_elements(v_version.payload -> 'sections') s(item)
  CROSS JOIN LATERAL jsonb_array_elements(s.item -> 'questions') q(item);
  IF v_expected_count = 0 OR v_expected_count > 1000 THEN
    RAISE EXCEPTION 'Assessment version has an invalid question count.' USING ERRCODE = '22023';
  END IF;
  IF v_expected_count <> (
    SELECT count(DISTINCT q.item ->> 'id')
    FROM jsonb_array_elements(v_version.payload -> 'sections') s(item)
    CROSS JOIN LATERAL jsonb_array_elements(s.item -> 'questions') q(item)
  ) THEN
    RAISE EXCEPTION 'Assessment version has duplicate assignment IDs.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_answers) AS submitted(key)
    WHERE NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_version.payload -> 'sections') s(item)
      CROSS JOIN LATERAL jsonb_array_elements(s.item -> 'questions') q(item)
      WHERE q.item ->> 'id' = key
    )
  ) THEN
    RAISE EXCEPTION 'Submission contains an unknown question-assignment ID.' USING ERRCODE = '22023';
  END IF;

  FOR v_section IN SELECT value FROM jsonb_array_elements(v_version.payload -> 'sections') LOOP
    FOR v_assignment IN SELECT value FROM jsonb_array_elements(v_section -> 'questions') LOOP
      v_key := v_assignment ->> 'id';
      IF v_key IS NULL OR v_key = '' THEN
        RAISE EXCEPTION 'Assessment version has a missing assignment ID.' USING ERRCODE = '22023';
      END IF;
      v_question := v_version.question_snapshots -> (v_assignment ->> 'questionId');
      IF v_question IS NULL THEN
        RAISE EXCEPTION 'Assessment version has an unavailable question snapshot.' USING ERRCODE = '23503';
      END IF;
      v_type := v_question ->> 'questionType';
      v_answer := p_answers -> v_key;
      v_is_unanswered := v_answer IS NULL OR v_answer = 'null'::jsonb OR
        v_answer = '""'::jsonb;
      v_is_correct := false;
      v_points := COALESCE((v_assignment ->> 'pointsOverride')::numeric, 1);
      IF v_points < 0 OR v_points > 1000000 THEN
        RAISE EXCEPTION 'Assessment version has invalid points.' USING ERRCODE = '22023';
      END IF;
      v_total_count := v_total_count + 1;
      v_possible := v_possible + v_points;

      IF v_type = 'multiple_choice' THEN
        v_choices := v_question -> 'choices';
        IF jsonb_typeof(v_choices) IS DISTINCT FROM 'array' OR jsonb_array_length(v_choices) = 0 THEN
          RAISE EXCEPTION 'Multiple-choice question is missing options.' USING ERRCODE = '22023';
        END IF;
        SELECT count(*) INTO v_expected_count FROM jsonb_array_elements(v_choices) c(item)
        WHERE c.item ->> 'isCorrect' = 'true';
        IF v_expected_count <> 1 THEN
          RAISE EXCEPTION 'Multiple-choice answer key is invalid.' USING ERRCODE = '22023';
        END IF;
        SELECT (c.ordinality - 1)::integer INTO v_correct_index
        FROM jsonb_array_elements(v_choices) WITH ORDINALITY c(item, ordinality)
        WHERE c.item ->> 'isCorrect' = 'true';
        v_selected_index := NULL;
        IF NOT v_is_unanswered THEN
          IF jsonb_typeof(v_answer) <> 'number' OR
             (v_answer #>> '{}') !~ '^[0-9]{1,6}$' THEN
            RAISE EXCEPTION 'Multiple-choice answers must be numeric option indexes.' USING ERRCODE = '22023';
          END IF;
          v_selected_index := (v_answer #>> '{}')::integer;
          IF v_selected_index >= jsonb_array_length(v_choices) THEN
            RAISE EXCEPTION 'Multiple-choice option index is out of range.' USING ERRCODE = '22023';
          END IF;
          v_is_correct := v_selected_index = v_correct_index;
        END IF;
      ELSIF v_type = 'grid_in' THEN
        v_numeric_key := public.parse_assessment_numeric_v1(v_question ->> 'numericAnswer');
        v_tolerance := public.parse_assessment_numeric_v1(COALESCE(v_question ->> 'numericTolerance', '0'));
        IF v_numeric_key IS NULL OR v_tolerance IS NULL OR v_tolerance < 0 THEN
          RAISE EXCEPTION 'Numeric question has an invalid stored answer key.' USING ERRCODE = '22023';
        END IF;
        IF NOT v_is_unanswered THEN
          IF jsonb_typeof(v_answer) NOT IN ('string', 'number') THEN
            RAISE EXCEPTION 'Numeric answers must be text or numbers.' USING ERRCODE = '22023';
          END IF;
          v_numeric_answer := public.parse_assessment_numeric_v1(v_answer #>> '{}');
          IF v_numeric_answer IS NOT NULL THEN
            v_is_correct := abs(v_numeric_answer - v_numeric_key) <= v_tolerance +
              (0.0000000000000018::numeric * greatest(1, abs(v_numeric_answer), abs(v_numeric_key)));
          END IF;
        END IF;
      ELSE
        RAISE EXCEPTION 'Unsupported question type: %', v_type USING ERRCODE = '22023';
      END IF;

      IF v_is_unanswered THEN v_unanswered_count := v_unanswered_count + 1; END IF;
      IF v_is_correct THEN
        v_correct_count := v_correct_count + 1;
        v_earned := v_earned + v_points;
      END IF;
      v_domain := COALESCE(NULLIF(btrim(v_question ->> 'domain'), ''), 'Uncategorized');
      v_stats := COALESCE(v_domain_stats -> v_domain,
        '{"total":0,"correct":0,"earned":0,"possible":0}'::jsonb);
      v_domain_stats := jsonb_set(v_domain_stats, ARRAY[v_domain], jsonb_build_object(
        'total', (v_stats ->> 'total')::integer + 1,
        'correct', (v_stats ->> 'correct')::integer + CASE WHEN v_is_correct THEN 1 ELSE 0 END,
        'earned', (v_stats ->> 'earned')::numeric + CASE WHEN v_is_correct THEN v_points ELSE 0 END,
        'possible', (v_stats ->> 'possible')::numeric + v_points
      ), true);
      v_questions_report := v_questions_report || jsonb_build_array(jsonb_build_object(
        'question_id', v_key,
        'section_id', v_section ->> 'id',
        'section_title', v_section ->> 'title',
        'content_blocks', jsonb_build_array(jsonb_build_object('type', 'text', 'value', v_question ->> 'prompt')),
        'explanation_blocks', CASE WHEN NULLIF(v_question ->> 'explanation', '') IS NOT NULL
          THEN jsonb_build_array(jsonb_build_object('type','text','value',v_question ->> 'explanation'))
          ELSE '[]'::jsonb END,
        'difficulty', COALESCE(v_question ->> 'difficulty', 'medium'),
        'answer_type_code', CASE WHEN v_type = 'grid_in' THEN 'GRID_IN' ELSE 'MCQ' END,
        'correct_answer_data', CASE WHEN v_type = 'grid_in'
          THEN jsonb_build_object('value', v_question -> 'numericAnswer', 'tolerance', v_tolerance)
          ELSE NULL END,
        'points_possible', v_points,
        'points_earned', CASE WHEN v_is_correct THEN v_points ELSE 0 END,
        'is_correct', v_is_correct,
        'status', CASE WHEN v_is_unanswered THEN 'unanswered'
          WHEN v_is_correct THEN 'correct' ELSE 'incorrect' END,
        'time_spent_seconds', 0,
        'student_answer', jsonb_build_object('value', COALESCE(v_answer, 'null'::jsonb),
          'choice_idx', CASE WHEN v_type = 'multiple_choice' THEN COALESCE(v_answer, 'null'::jsonb)
            ELSE NULL END),
        'category_name', v_domain,
        'lesson_name', NULLIF(v_question ->> 'lesson', ''),
        'skill_name', NULLIF(v_question ->> 'chapter', ''),
        'choices', COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'id', c.value -> 'id',
          'content_blocks', jsonb_build_array(jsonb_build_object('type','text','value', c.value ->> 'text')),
          'is_correct', COALESCE((c.value ->> 'isCorrect')::boolean, false)
        ) ORDER BY c.ordinality)
        FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_question -> 'choices') = 'array'
          THEN v_question -> 'choices' ELSE '[]'::jsonb END)
          WITH ORDINALITY c(value, ordinality)), '[]'::jsonb)
      ));
    END LOOP;
  END LOOP;

  v_percentage := CASE WHEN v_possible > 0 THEN round(100 * v_earned / v_possible) ELSE 0 END;
  v_completed_at := clock_timestamp();
  v_duration := greatest(0, least(2147483647,
    floor(extract(epoch FROM v_completed_at - v_attempt.started_at))::bigint))::integer;

  FOR v_entry IN SELECT key, value FROM jsonb_each(v_domain_stats) LOOP
    v_breakdowns := v_breakdowns || jsonb_build_array(jsonb_build_object(
      'type', 'category', 'id', NULL,
      'label', v_entry.key,
      'total_questions', (v_entry.value ->> 'total')::integer,
      'correct_count', (v_entry.value ->> 'correct')::integer,
      'points_earned', (v_entry.value ->> 'earned')::numeric,
      'points_possible', (v_entry.value ->> 'possible')::numeric,
      'percentage', CASE WHEN (v_entry.value ->> 'possible')::numeric > 0
        THEN round(100 * (v_entry.value ->> 'earned')::numeric / (v_entry.value ->> 'possible')::numeric)
        ELSE 0 END,
      'classification', NULL,
      'avg_time_seconds', 0
    ));
  END LOOP;

  v_report := jsonb_build_object(
    'student_info', jsonb_build_object(
      'attempt_id', v_attempt.id,
      'assessment_name', v_version.name,
      'assessment_version', v_version.version_number,
      'assessment_version_id', v_version.id,
      'started_at', v_attempt.started_at,
      'completed_at', v_completed_at,
      'total_time_seconds', v_duration,
      'registration_responses', v_registration
    ),
    'overall', jsonb_build_object(
      'total_questions', v_total_count,
      'correct_count', v_correct_count,
      'incorrect_count', v_total_count - v_correct_count,
      'unanswered_count', v_unanswered_count,
      'points_earned', v_earned,
      'points_possible', v_possible,
      'percentage', v_percentage,
      'calculated_at', v_completed_at,
      'avg_time_per_question', round(v_duration::numeric / greatest(1,v_total_count)),
      'avg_time_correct', 0, 'avg_time_incorrect', 0,
      'rushed_mistakes_count', 0, 'timesink_mistakes_count', 0,
      'level', NULL
    ),
    'breakdowns', v_breakdowns,
    'questions', v_questions_report,
    'courses', '[]'::jsonb,
    'org_settings', NULL
  );

  -- Server-side, version-pinned score presentation. Raw correctness and points above
  -- remain authoritative; no client-provided scale or score is accepted.
  v_report := jsonb_set(v_report, '{scoring}',
    public.compute_assessment_scoring_v1(v_version.payload, v_report), true);

  -- Trusted function owns this write. Ordinary anon/authenticated roles lose
  -- direct INSERT/UPDATE privileges below.
  UPDATE public.attempts SET
    status = 'completed', completed_at = v_completed_at,
    answers = p_answers, percentage = v_percentage,
    correct_count = v_correct_count, total_questions = v_total_count,
    level_name = 'Scored', report_data = v_report
  WHERE id = v_attempt.id AND status = 'in_progress';
  IF NOT FOUND THEN RAISE EXCEPTION 'Attempt completion was not confirmed.'; END IF;
  RETURN jsonb_build_object('id', v_attempt.id, 'status', 'completed',
    'percentage', v_percentage, 'correct_count', v_correct_count,
    'total_questions', v_total_count, 'completed_at', v_completed_at,
    'already_completed', false);
END;
$$;
REVOKE ALL ON FUNCTION public.submit_student_attempt_v1(uuid,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_student_attempt_v1(uuid,uuid,jsonb) TO anon, authenticated;
COMMIT;
