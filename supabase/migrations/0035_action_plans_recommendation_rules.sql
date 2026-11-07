-- ============================================================
-- Migration 0035: Generic Action Plans + Recommendation Rules
-- ============================================================
--
-- Purpose:
--   Introduce a generic, assessment-independent recommendation layer.
--
-- Design:
--
--   action_plans
--       -> action_plan_items
--
--   recommendation_rules
--       -> recommendation_rule_action_plans
--
-- Recommendation rules are intentionally condition-driven through JSONB.
-- This avoids hard-coding concepts such as:
--   * SAT / ACT / EST
--   * subject / chapter / lesson / skill
--   * Beginner / Intermediate / Advanced
--   * courses as the only recommendation target
--
-- An action plan is a reusable set of actions/content that can be
-- recommended by one or more rules.
--
-- This migration is additive:
--   * legacy levels/courses/level_courses/evaluation_rules remain untouched
--   * no existing data is migrated
--   * no existing result/report functions are replaced
--
-- ============================================================


-- ------------------------------------------------------------
-- Action plans
-- ------------------------------------------------------------
--
-- A reusable recommendation package.
--
-- Examples (examples only; not required vocabulary):
--   "Foundational Review"
--   "Algebra Recovery Plan"
--   "Exam Readiness Path"
--
create table if not exists public.action_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,

  name text not null,
  code text,
  description text,

  is_active boolean not null default true,

  -- Reserved for future presentation/channel configuration.
  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (organization_id, name)
);

create index if not exists idx_action_plans_org
  on public.action_plans(organization_id);

create index if not exists idx_action_plans_active
  on public.action_plans(organization_id, is_active);


-- ------------------------------------------------------------
-- Action plan items
-- ------------------------------------------------------------
--
-- Items are intentionally generic.
--
-- item_type is descriptive rather than a fixed platform taxonomy.
-- The item payload can represent:
--   content, task, resource, course, link, instruction, etc.
--
-- Keeping the payload in JSONB means the platform does not need a
-- schema migration every time a new action type is introduced.
--
create table if not exists public.action_plan_items (
  id uuid primary key default gen_random_uuid(),
  action_plan_id uuid not null
    references public.action_plans(id) on delete cascade,

  item_type text not null,
  title text not null,
  description text,

  display_order integer not null default 0,
  is_required boolean not null default false,
  is_active boolean not null default true,

  payload jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_action_plan_items_plan
  on public.action_plan_items(action_plan_id);

create index if not exists idx_action_plan_items_order
  on public.action_plan_items(action_plan_id, display_order);


-- ------------------------------------------------------------
-- Recommendation rules
-- ------------------------------------------------------------
--
-- A rule determines when one or more action plans should be
-- recommended.
--
-- conditions is deliberately JSONB. The recommendation engine can
-- later support conditions such as:
--
--   {
--     "all": [
--       {"field": "overall_percentage", "operator": "lt", "value": 60},
--       {"field": "taxonomy_node", "operator": "in", "value": ["..."]}
--     ]
--   }
--
-- The schema does NOT prescribe the condition vocabulary.
-- That vocabulary belongs to the future evaluation/recommendation
-- engine, not to the database structure.
--
create table if not exists public.recommendation_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,

  name text not null,
  code text,
  description text,

  priority integer not null default 0,
  is_active boolean not null default true,

  conditions jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (organization_id, name)
);

create index if not exists idx_recommendation_rules_org
  on public.recommendation_rules(organization_id);

create index if not exists idx_recommendation_rules_active_priority
  on public.recommendation_rules(organization_id, is_active, priority);


-- ------------------------------------------------------------
-- Recommendation rule -> action plan
-- ------------------------------------------------------------
--
-- A rule can produce multiple action plans.
-- An action plan can be reused by multiple rules.
--
create table if not exists public.recommendation_rule_action_plans (
  recommendation_rule_id uuid not null
    references public.recommendation_rules(id) on delete cascade,

  action_plan_id uuid not null
    references public.action_plans(id) on delete restrict,

  display_order integer not null default 0,

  created_at timestamptz not null default now(),

  primary key (recommendation_rule_id, action_plan_id)
);

create index if not exists idx_recommendation_rule_action_plans_plan
  on public.recommendation_rule_action_plans(action_plan_id);

create index if not exists idx_recommendation_rule_action_plans_order
  on public.recommendation_rule_action_plans(recommendation_rule_id, display_order);


-- ------------------------------------------------------------
-- Row Level Security
-- ------------------------------------------------------------

alter table public.action_plans enable row level security;
alter table public.action_plan_items enable row level security;
alter table public.recommendation_rules enable row level security;
alter table public.recommendation_rule_action_plans enable row level security;


-- ------------------------------------------------------------
-- Action plan policies
-- ------------------------------------------------------------

create policy "org staff can view action plans"
  on public.action_plans
  for select
  using (
    organization_id = (
      select organization_id
      from public.profiles
      where id = auth.uid()
    )
  );

create policy "org staff can insert action plans"
  on public.action_plans
  for insert
  with check (
    organization_id = (
      select organization_id
      from public.profiles
      where id = auth.uid()
    )
  );

create policy "org staff can update action plans"
  on public.action_plans
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

create policy "org staff can delete action plans"
  on public.action_plans
  for delete
  using (
    organization_id = (
      select organization_id
      from public.profiles
      where id = auth.uid()
    )
  );


-- Action plan items inherit organization ownership through the plan.

create policy "org staff can view action plan items"
  on public.action_plan_items
  for select
  using (
    exists (
      select 1
      from public.action_plans ap
      where ap.id = action_plan_items.action_plan_id
        and ap.organization_id = (
          select organization_id
          from public.profiles
          where id = auth.uid()
        )
    )
  );

create policy "org staff can insert action plan items"
  on public.action_plan_items
  for insert
  with check (
    exists (
      select 1
      from public.action_plans ap
      where ap.id = action_plan_items.action_plan_id
        and ap.organization_id = (
          select organization_id
          from public.profiles
          where id = auth.uid()
        )
    )
  );

create policy "org staff can update action plan items"
  on public.action_plan_items
  for update
  using (
    exists (
      select 1
      from public.action_plans ap
      where ap.id = action_plan_items.action_plan_id
        and ap.organization_id = (
          select organization_id
          from public.profiles
          where id = auth.uid()
        )
    )
  )
  with check (
    exists (
      select 1
      from public.action_plans ap
      where ap.id = action_plan_items.action_plan_id
        and ap.organization_id = (
          select organization_id
          from public.profiles
          where id = auth.uid()
        )
    )
  );

create policy "org staff can delete action plan items"
  on public.action_plan_items
  for delete
  using (
    exists (
      select 1
      from public.action_plans ap
      where ap.id = action_plan_items.action_plan_id
        and ap.organization_id = (
          select organization_id
          from public.profiles
          where id = auth.uid()
        )
    )
  );


-- ------------------------------------------------------------
-- Recommendation rule policies
-- ------------------------------------------------------------

create policy "org staff can view recommendation rules"
  on public.recommendation_rules
  for select
  using (
    organization_id = (
      select organization_id
      from public.profiles
      where id = auth.uid()
    )
  );

create policy "org staff can insert recommendation rules"
  on public.recommendation_rules
  for insert
  with check (
    organization_id = (
      select organization_id
      from public.profiles
      where id = auth.uid()
    )
  );

create policy "org staff can update recommendation rules"
  on public.recommendation_rules
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

create policy "org staff can delete recommendation rules"
  on public.recommendation_rules
  for delete
  using (
    organization_id = (
      select organization_id
      from public.profiles
      where id = auth.uid()
    )
  );


-- ------------------------------------------------------------
-- Recommendation rule -> action plan policies
-- ------------------------------------------------------------
--
-- Both sides must belong to the current organization.
-- This prevents cross-organization links even if a caller knows
-- another organization's UUID.
-- ------------------------------------------------------------

create policy "org staff can view recommendation rule action plans"
  on public.recommendation_rule_action_plans
  for select
  using (
    exists (
      select 1
      from public.recommendation_rules rr
      join public.action_plans ap
        on ap.id = recommendation_rule_action_plans.action_plan_id
      where rr.id = recommendation_rule_action_plans.recommendation_rule_id
        and rr.organization_id = (
          select organization_id
          from public.profiles
          where id = auth.uid()
        )
        and ap.organization_id = rr.organization_id
    )
  );

create policy "org staff can insert recommendation rule action plans"
  on public.recommendation_rule_action_plans
  for insert
  with check (
    exists (
      select 1
      from public.recommendation_rules rr
      join public.action_plans ap
        on ap.id = recommendation_rule_action_plans.action_plan_id
      where rr.id = recommendation_rule_action_plans.recommendation_rule_id
        and rr.organization_id = (
          select organization_id
          from public.profiles
          where id = auth.uid()
        )
        and ap.organization_id = rr.organization_id
    )
  );

create policy "org staff can update recommendation rule action plans"
  on public.recommendation_rule_action_plans
  for update
  using (
    exists (
      select 1
      from public.recommendation_rules rr
      join public.action_plans ap
        on ap.id = recommendation_rule_action_plans.action_plan_id
      where rr.id = recommendation_rule_action_plans.recommendation_rule_id
        and rr.organization_id = (
          select organization_id
          from public.profiles
          where id = auth.uid()
        )
        and ap.organization_id = rr.organization_id
    )
  )
  with check (
    exists (
      select 1
      from public.recommendation_rules rr
      join public.action_plans ap
        on ap.id = recommendation_rule_action_plans.action_plan_id
      where rr.id = recommendation_rule_action_plans.recommendation_rule_id
        and rr.organization_id = (
          select organization_id
          from public.profiles
          where id = auth.uid()
        )
        and ap.organization_id = rr.organization_id
    )
  );

create policy "org staff can delete recommendation rule action plans"
  on public.recommendation_rule_action_plans
  for delete
  using (
    exists (
      select 1
      from public.recommendation_rules rr
      join public.action_plans ap
        on ap.id = recommendation_rule_action_plans.action_plan_id
      where rr.id = recommendation_rule_action_plans.recommendation_rule_id
        and rr.organization_id = (
          select organization_id
          from public.profiles
          where id = auth.uid()
        )
        and ap.organization_id = rr.organization_id
    )
  );
