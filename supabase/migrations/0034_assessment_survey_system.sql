-- ============================================================
-- Migration 0034: Generic assessment survey system
-- ============================================================
--
-- Purpose:
--   Introduce a normalized, assessment-scoped survey model without
--   replacing the existing organization_app_configs / student_survey_responses
--   compatibility path.
--
-- Design:
--   assessments
--       -> assessment_surveys
--           -> survey_questions
--               -> survey_question_options
--
--   attempts
--       -> attempt_survey_responses
--           -> attempt_survey_answers
--
-- Survey questions are intentionally generic:
--   * question_type is free-form text so the platform is not locked
--     to a fixed survey vocabulary.
--   * question configuration and answers use JSONB so new question
--     behaviors do not require schema changes.
--
-- No existing data is migrated by this migration.
-- ============================================================

create table if not exists public.assessment_surveys (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null
    references public.assessments(id) on delete cascade,

  name text not null,
  description text,
  instructions text,

  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (assessment_id)
);

create index if not exists idx_assessment_surveys_assessment
  on public.assessment_surveys(assessment_id);

create index if not exists idx_assessment_surveys_active
  on public.assessment_surveys(assessment_id, is_active);


-- ------------------------------------------------------------
-- Survey questions
-- ------------------------------------------------------------
--
-- question_type is intentionally unconstrained.
-- Examples might include:
--   single_choice
--   multiple_choice
--   scale
--   text
--   yes_no
--   matrix
--
-- config can contain validation/display metadata such as:
--   {"min":1,"max":5,"labels":{"1":"Not at all","5":"Very much"}}
--
create table if not exists public.survey_questions (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null
    references public.assessment_surveys(id) on delete cascade,

  question_type text not null,
  prompt text not null,

  is_required boolean not null default false,
  display_order integer not null default 0,

  config jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_survey_questions_survey
  on public.survey_questions(survey_id);

create index if not exists idx_survey_questions_order
  on public.survey_questions(survey_id, display_order);


-- ------------------------------------------------------------
-- Survey question options
-- ------------------------------------------------------------
--
-- Used when a survey question needs predefined options.
-- The answer itself is still stored as JSONB so future question
-- types can use richer answer structures without schema changes.
--
create table if not exists public.survey_question_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null
    references public.survey_questions(id) on delete cascade,

  value text not null,
  label text not null,
  display_order integer not null default 0,

  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_survey_question_options_question
  on public.survey_question_options(question_id);

create index if not exists idx_survey_question_options_order
  on public.survey_question_options(question_id, display_order);


-- ------------------------------------------------------------
-- Attempt survey responses
-- ------------------------------------------------------------
--
-- One response container per attempt/survey.
-- A survey can be submitted independently from the assessment result
-- calculation, which keeps survey data separate from scoring.
--
create table if not exists public.attempt_survey_responses (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null
    references public.attempts(id) on delete cascade,
  survey_id uuid not null
    references public.assessment_surveys(id) on delete cascade,

  status text not null default 'in_progress'
    check (status in ('in_progress', 'submitted')),

  started_at timestamptz not null default now(),
  submitted_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (attempt_id, survey_id)
);

create index if not exists idx_attempt_survey_responses_attempt
  on public.attempt_survey_responses(attempt_id);

create index if not exists idx_attempt_survey_responses_survey
  on public.attempt_survey_responses(survey_id);


-- ------------------------------------------------------------
-- Attempt survey answers
-- ------------------------------------------------------------
--
-- One row per answered survey question.
-- answer_data remains JSONB intentionally.
--
create table if not exists public.attempt_survey_answers (
  id uuid primary key default gen_random_uuid(),
  response_id uuid not null
    references public.attempt_survey_responses(id) on delete cascade,
  question_id uuid not null
    references public.survey_questions(id) on delete cascade,

  answer_data jsonb not null default '{}'::jsonb,

  answered_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (response_id, question_id)
);

create index if not exists idx_attempt_survey_answers_response
  on public.attempt_survey_answers(response_id);

create index if not exists idx_attempt_survey_answers_question
  on public.attempt_survey_answers(question_id);


-- ------------------------------------------------------------
-- Row Level Security
-- ------------------------------------------------------------
--
-- Students use the existing resume-token flow rather than an auth
-- session. Direct student access will therefore be implemented later
-- through security-definer RPCs, consistent with the assessment flow.
--
-- Staff policies are intentionally limited to the organization that
-- owns the related assessment/attempt.
--
alter table public.assessment_surveys enable row level security;
alter table public.survey_questions enable row level security;
alter table public.survey_question_options enable row level security;
alter table public.attempt_survey_responses enable row level security;
alter table public.attempt_survey_answers enable row level security;


create policy "org staff can view assessment surveys"
  on public.assessment_surveys
  for select
  using (
    exists (
      select 1
      from public.assessments a
      where a.id = assessment_surveys.assessment_id
        and a.organization_id = (
          select organization_id
          from public.profiles
          where id = auth.uid()
        )
    )
  );

create policy "org staff can manage assessment surveys"
  on public.assessment_surveys
  for all
  using (
    exists (
      select 1
      from public.assessments a
      where a.id = assessment_surveys.assessment_id
        and a.organization_id = (
          select organization_id
          from public.profiles
          where id = auth.uid()
        )
    )
  )
  with check (
    exists (
      select 1
      from public.assessments a
      where a.id = assessment_surveys.assessment_id
        and a.organization_id = (
          select organization_id
          from public.profiles
          where id = auth.uid()
        )
    )
  );


create policy "org staff can view survey questions"
  on public.survey_questions
  for select
  using (
    exists (
      select 1
      from public.assessment_surveys s
      join public.assessments a on a.id = s.assessment_id
      where s.id = survey_questions.survey_id
        and a.organization_id = (
          select organization_id
          from public.profiles
          where id = auth.uid()
        )
    )
  );

create policy "org staff can manage survey questions"
  on public.survey_questions
  for all
  using (
    exists (
      select 1
      from public.assessment_surveys s
      join public.assessments a on a.id = s.assessment_id
      where s.id = survey_questions.survey_id
        and a.organization_id = (
          select organization_id
          from public.profiles
          where id = auth.uid()
        )
    )
  )
  with check (
    exists (
      select 1
      from public.assessment_surveys s
      join public.assessments a on a.id = s.assessment_id
      where s.id = survey_questions.survey_id
        and a.organization_id = (
          select organization_id
          from public.profiles
          where id = auth.uid()
        )
    )
  );


create policy "org staff can view survey question options"
  on public.survey_question_options
  for select
  using (
    exists (
      select 1
      from public.survey_questions q
      join public.assessment_surveys s on s.id = q.survey_id
      join public.assessments a on a.id = s.assessment_id
      where q.id = survey_question_options.question_id
        and a.organization_id = (
          select organization_id
          from public.profiles
          where id = auth.uid()
        )
    )
  );

create policy "org staff can manage survey question options"
  on public.survey_question_options
  for all
  using (
    exists (
      select 1
      from public.survey_questions q
      join public.assessment_surveys s on s.id = q.survey_id
      join public.assessments a on a.id = s.assessment_id
      where q.id = survey_question_options.question_id
        and a.organization_id = (
          select organization_id
          from public.profiles
          where id = auth.uid()
        )
    )
  )
  with check (
    exists (
      select 1
      from public.survey_questions q
      join public.assessment_surveys s on s.id = q.survey_id
      join public.assessments a on a.id = s.assessment_id
      where q.id = survey_question_options.question_id
        and a.organization_id = (
          select organization_id
          from public.profiles
          where id = auth.uid()
        )
    )
  );


create policy "org staff can view attempt survey responses"
  on public.attempt_survey_responses
  for select
  using (
    exists (
      select 1
      from public.attempts at
      where at.id = attempt_survey_responses.attempt_id
        and at.organization_id = (
          select organization_id
          from public.profiles
          where id = auth.uid()
        )
    )
  );


create policy "org staff can view attempt survey answers"
  on public.attempt_survey_answers
  for select
  using (
    exists (
      select 1
      from public.attempt_survey_responses r
      join public.attempts at on at.id = r.attempt_id
      where r.id = attempt_survey_answers.response_id
        and at.organization_id = (
          select organization_id
          from public.profiles
          where id = auth.uid()
        )
    )
  );

-- No direct INSERT/UPDATE/DELETE policies are granted to authenticated
-- staff for attempt responses/answers in this foundation migration.
-- Student writes will be handled by dedicated token-validated RPCs,
-- so the public client never receives broad write access to these tables.
