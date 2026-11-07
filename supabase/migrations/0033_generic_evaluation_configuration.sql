-- ============================================================
-- Migration 0033: Generic evaluation configuration foundation
-- ============================================================
--
-- Purpose:
--   Introduce assessment-scoped, generic evaluation configuration
--   without replacing the existing levels/evaluation_rules tables yet.
--
-- Design:
--   evaluation_profiles
--       -> evaluation_profile_levels
--       -> evaluation_profile_rules
--
--   assessments
--       -> assessment_evaluation_profiles
--
-- This keeps evaluation configuration separate from:
--   * the question taxonomy
--   * assessment structure/modules
--   * legacy organization-wide levels
--
-- The existing levels/evaluation_rules/attempt_results/
-- attempt_breakdowns tables remain untouched for compatibility.
--
-- No existing data is migrated by this migration.
-- ============================================================

create table if not exists public.evaluation_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  name text not null,
  code text,
  description text,

  -- The profile can be used by one or more assessments.
  is_active boolean not null default true,

  -- Controls how the overall score is interpreted.
  -- Kept generic so future evaluation engines are not tied to
  -- percentage-only scoring.
  scoring_method text not null default 'percentage'
    check (scoring_method in (
      'percentage',
      'points',
      'weighted_percentage'
    )),

  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (organization_id, name)
);

create index if not exists idx_evaluation_profiles_org
  on public.evaluation_profiles(organization_id);

create index if not exists idx_evaluation_profiles_active
  on public.evaluation_profiles(organization_id, is_active);


-- ------------------------------------------------------------
-- Evaluation levels
-- ------------------------------------------------------------
--
-- A profile can define any number of performance bands.
-- Example:
--
--   Foundation  0-39
--   Developing 40-59
--   Proficient  60-79
--   Advanced    80-100
--
-- These names are examples only; the platform does not impose
-- a fixed set of levels.
--
create table if not exists public.evaluation_profile_levels (
  id uuid primary key default gen_random_uuid(),
  evaluation_profile_id uuid not null
    references public.evaluation_profiles(id) on delete cascade,

  name text not null,
  code text,
  description text,

  min_value numeric not null,
  max_value numeric not null,

  display_order integer not null default 0,
  is_active boolean not null default true,

  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (min_value <= max_value)
);

create index if not exists idx_evaluation_profile_levels_profile
  on public.evaluation_profile_levels(evaluation_profile_id);

create index if not exists idx_evaluation_profile_levels_order
  on public.evaluation_profile_levels(evaluation_profile_id, display_order);


-- ------------------------------------------------------------
-- Evaluation rules
-- ------------------------------------------------------------
--
-- Generic key/value rules scoped to an evaluation profile.
--
-- Examples:
--   strong_threshold_percent
--   weak_threshold_percent
--   minimum_questions_for_classification
--   require_all_modules_completed
--
-- rule_value remains JSONB intentionally so future rules can
-- contain numbers, strings, booleans, arrays, or objects.
--
create table if not exists public.evaluation_profile_rules (
  id uuid primary key default gen_random_uuid(),
  evaluation_profile_id uuid not null
    references public.evaluation_profiles(id) on delete cascade,

  rule_key text not null,
  rule_value jsonb not null,
  description text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (evaluation_profile_id, rule_key)
);

create index if not exists idx_evaluation_profile_rules_profile
  on public.evaluation_profile_rules(evaluation_profile_id);


-- ------------------------------------------------------------
-- Assessment -> evaluation profile
-- ------------------------------------------------------------
--
-- An assessment may use one evaluation profile at a time.
-- The separate relationship table leaves room for future
-- multi-profile workflows without putting configuration
-- directly on assessments.
--
create table if not exists public.assessment_evaluation_profiles (
  assessment_id uuid primary key
    references public.assessments(id) on delete cascade,

  evaluation_profile_id uuid not null
    references public.evaluation_profiles(id) on delete restrict,

  created_at timestamptz not null default now()
);

create index if not exists idx_assessment_evaluation_profiles_profile
  on public.assessment_evaluation_profiles(evaluation_profile_id);


-- ------------------------------------------------------------
-- Row Level Security
-- ------------------------------------------------------------

alter table public.evaluation_profiles enable row level security;
alter table public.evaluation_profile_levels enable row level security;
alter table public.evaluation_profile_rules enable row level security;
alter table public.assessment_evaluation_profiles enable row level security;


-- Organization staff can view/manage their evaluation profiles.
create policy "org staff can view evaluation profiles"
  on public.evaluation_profiles
  for select
  using (
    organization_id = (
      select organization_id
      from public.profiles
      where id = auth.uid()
    )
  );

create policy "org staff can insert evaluation profiles"
  on public.evaluation_profiles
  for insert
  with check (
    organization_id = (
      select organization_id
      from public.profiles
      where id = auth.uid()
    )
  );

create policy "org staff can update evaluation profiles"
  on public.evaluation_profiles
  for update
  using (
    organization_id = (
      select organization_id
      from public.profiles
      where id = auth.uid()
    )
  )
  with check (
    organization_id = (
      select organization_id
      from public.profiles
      where id = auth.uid()
    )
  );

create policy "org staff can delete evaluation profiles"
  on public.evaluation_profiles
  for delete
  using (
    organization_id = (
      select organization_id
      from public.profiles
      where id = auth.uid()
    )
  );


-- Levels inherit organization ownership through their profile.
create policy "org staff can view evaluation profile levels"
  on public.evaluation_profile_levels
  for select
  using (
    exists (
      select 1
      from public.evaluation_profiles ep
      where ep.id = evaluation_profile_levels.evaluation_profile_id
        and ep.organization_id = (
          select organization_id
          from public.profiles
          where id = auth.uid()
        )
    )
  );

create policy "org staff can insert evaluation profile levels"
  on public.evaluation_profile_levels
  for insert
  with check (
    exists (
      select 1
      from public.evaluation_profiles ep
      where ep.id = evaluation_profile_levels.evaluation_profile_id
        and ep.organization_id = (
          select organization_id
          from public.profiles
          where id = auth.uid()
        )
    )
  );

create policy "org staff can update evaluation profile levels"
  on public.evaluation_profile_levels
  for update
  using (
    exists (
      select 1
      from public.evaluation_profiles ep
      where ep.id = evaluation_profile_levels.evaluation_profile_id
        and ep.organization_id = (
          select organization_id
          from public.profiles
          where id = auth.uid()
        )
    )
  )
  with check (
    exists (
      select 1
      from public.evaluation_profiles ep
      where ep.id = evaluation_profile_levels.evaluation_profile_id
        and ep.organization_id = (
          select organization_id
          from public.profiles
          where id = auth.uid()
        )
    )
  );

create policy "org staff can delete evaluation profile levels"
  on public.evaluation_profile_levels
  for delete
  using (
    exists (
      select 1
      from public.evaluation_profiles ep
      where ep.id = evaluation_profile_levels.evaluation_profile_id
        and ep.organization_id = (
          select organization_id
          from public.profiles
          where id = auth.uid()
        )
    )
  );


-- Rules inherit organization ownership through their profile.
create policy "org staff can view evaluation profile rules"
  on public.evaluation_profile_rules
  for select
  using (
    exists (
      select 1
      from public.evaluation_profiles ep
      where ep.id = evaluation_profile_rules.evaluation_profile_id
        and ep.organization_id = (
          select organization_id
          from public.profiles
          where id = auth.uid()
        )
    )
  );

create policy "org staff can insert evaluation profile rules"
  on public.evaluation_profile_rules
  for insert
  with check (
    exists (
      select 1
      from public.evaluation_profiles ep
      where ep.id = evaluation_profile_rules.evaluation_profile_id
        and ep.organization_id = (
          select organization_id
          from public.profiles
          where id = auth.uid()
        )
    )
  );

create policy "org staff can update evaluation profile rules"
  on public.evaluation_profile_rules
  for update
  using (
    exists (
      select 1
      from public.evaluation_profiles ep
      where ep.id = evaluation_profile_rules.evaluation_profile_id
        and ep.organization_id = (
          select organization_id
          from public.profiles
          where id = auth.uid()
        )
    )
  )
  with check (
    exists (
      select 1
      from public.evaluation_profiles ep
      where ep.id = evaluation_profile_rules.evaluation_profile_id
        and ep.organization_id = (
          select organization_id
          from public.profiles
          where id = auth.uid()
        )
    )
  );

create policy "org staff can delete evaluation profile rules"
  on public.evaluation_profile_rules
  for delete
  using (
    exists (
      select 1
      from public.evaluation_profiles ep
      where ep.id = evaluation_profile_rules.evaluation_profile_id
        and ep.organization_id = (
          select organization_id
          from public.profiles
          where id = auth.uid()
        )
    )
  );


-- Assessment/profile relationship inherits organization ownership
-- through the assessment itself and the profile.
create policy "org staff can view assessment evaluation profiles"
  on public.assessment_evaluation_profiles
  for select
  using (
    exists (
      select 1
      from public.assessments a
      join public.evaluation_profiles ep
        on ep.id = assessment_evaluation_profiles.evaluation_profile_id
      where a.id = assessment_evaluation_profiles.assessment_id
        and a.organization_id = (
          select organization_id
          from public.profiles
          where id = auth.uid()
        )
        and ep.organization_id = a.organization_id
    )
  );

create policy "org staff can insert assessment evaluation profiles"
  on public.assessment_evaluation_profiles
  for insert
  with check (
    exists (
      select 1
      from public.assessments a
      join public.evaluation_profiles ep
        on ep.id = assessment_evaluation_profiles.evaluation_profile_id
      where a.id = assessment_evaluation_profiles.assessment_id
        and a.organization_id = (
          select organization_id
          from public.profiles
          where id = auth.uid()
        )
        and ep.organization_id = a.organization_id
    )
  );

create policy "org staff can update assessment evaluation profiles"
  on public.assessment_evaluation_profiles
  for update
  using (
    exists (
      select 1
      from public.assessments a
      join public.evaluation_profiles ep
        on ep.id = assessment_evaluation_profiles.evaluation_profile_id
      where a.id = assessment_evaluation_profiles.assessment_id
        and a.organization_id = (
          select organization_id
          from public.profiles
          where id = auth.uid()
        )
        and ep.organization_id = a.organization_id
    )
  )
  with check (
    exists (
      select 1
      from public.assessments a
      join public.evaluation_profiles ep
        on ep.id = assessment_evaluation_profiles.evaluation_profile_id
      where a.id = assessment_evaluation_profiles.assessment_id
        and a.organization_id = (
          select organization_id
          from public.profiles
          where id = auth.uid()
        )
        and ep.organization_id = a.organization_id
    )
  );

create policy "org staff can delete assessment evaluation profiles"
  on public.assessment_evaluation_profiles
  for delete
  using (
    exists (
      select 1
      from public.assessments a
      join public.evaluation_profiles ep
        on ep.id = assessment_evaluation_profiles.evaluation_profile_id
      where a.id = assessment_evaluation_profiles.assessment_id
        and a.organization_id = (
          select organization_id
          from public.profiles
          where id = auth.uid()
        )
        and ep.organization_id = a.organization_id
    )
  );

-- ============================================================
-- Intentionally NOT included:
--
-- * No changes to levels
-- * No changes to evaluation_rules
-- * No changes to attempt_results
-- * No changes to attempt_breakdowns
-- * No grading RPC changes
-- * No legacy-data backfill
--
-- Those belong to later compatibility/result-engine steps after
-- the generic evaluation model is verified.
-- ============================================================
