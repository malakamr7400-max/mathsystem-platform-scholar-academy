-- STEP 75.8: Numeric equivalence helper for authoritative Grid-in grading.
-- IMPORTANT: Deploying this helper ALONE does NOT change submit_student_attempt_v1.
-- The server-side grading RPC must call public.mathsystem_grid_numeric_equal_v1
-- at its Grid-in comparison site. Review the original function body before editing.
-- Exact NUMERIC arithmetic; no JavaScript floats or hidden rounding allowances.
CREATE OR REPLACE FUNCTION public.mathsystem_grid_numeric_parse_v1(p_input text)
RETURNS numeric
LANGUAGE plpgsql IMMUTABLE STRICT SET search_path = pg_catalog
AS $$
DECLARE
  v text := btrim(p_input);
  parts text[];
  numerator numeric;
  denominator numeric;
BEGIN
  IF length(v) > 100 THEN RETURN NULL; END IF;
  IF v ~ '^[+-]?([0-9]+(\.[0-9]*)?|\.[0-9]+)$' THEN
    RETURN v::numeric;
  END IF;
  IF v ~ '^[+-]?([0-9]+(\.[0-9]*)?|\.[0-9]+)[[:space:]]*/[[:space:]]*[+-]?([0-9]+(\.[0-9]*)?|\.[0-9]+)$' THEN
    parts := regexp_split_to_array(v, '[[:space:]]*/[[:space:]]*');
    numerator := parts[1]::numeric;
    denominator := parts[2]::numeric;
    IF denominator = 0 THEN RETURN NULL; END IF;
    RETURN numerator / denominator;
  END IF;
  RETURN NULL;
EXCEPTION WHEN numeric_value_out_of_range OR division_by_zero OR invalid_text_representation THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.mathsystem_grid_numeric_equal_v1(
  p_student_answer text,
  p_correct_answer text,
  p_tolerance numeric DEFAULT 0
)
RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog
AS $$
DECLARE
  a numeric;
  b numeric;
BEGIN
  IF p_tolerance IS NULL OR p_tolerance < 0 THEN RETURN false; END IF;
  a := public.mathsystem_grid_numeric_parse_v1(p_student_answer);
  b := public.mathsystem_grid_numeric_parse_v1(p_correct_answer);
  IF a IS NULL OR b IS NULL THEN RETURN false; END IF;
  RETURN abs(a - b) <= p_tolerance;
EXCEPTION WHEN numeric_value_out_of_range OR division_by_zero THEN
  RETURN false;
END;
$$;

-- Not a public student API. Called internally by a server-side grading function.
REVOKE ALL ON FUNCTION public.mathsystem_grid_numeric_parse_v1(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mathsystem_grid_numeric_equal_v1(text,text,numeric) FROM PUBLIC;

-- Integration sketch INSIDE your existing authorized grading RPC:
-- IF question_type = 'grid_in' THEN
--   is_correct := public.mathsystem_grid_numeric_equal_v1(
--     student_answer_text, saved_correct_answer_text, coalesce(saved_tolerance,0)
--   );
-- END IF;
-- Keep the original token checks, grading ownership, version-pinned keys,
-- immutable completed-attempt behavior, and permissions intact.
