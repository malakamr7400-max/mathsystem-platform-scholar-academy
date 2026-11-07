-- 0032_assessment_taxonomies.sql
-- Generic relationship between assessments and taxonomies.
-- Taxonomy structure remains independent from the assessment.

create table if not exists public.assessment_taxonomies (
  assessment_id uuid not null
    references public.assessments(id)
    on delete cascade,

  taxonomy_id uuid not null
    references public.taxonomies(id)
    on delete restrict,

  is_primary boolean not null default false,

  sort_order integer not null default 0,

  created_at timestamptz not null default now(),

  primary key (assessment_id, taxonomy_id)
);

create index if not exists idx_assessment_taxonomies_taxonomy
  on public.assessment_taxonomies(taxonomy_id);

create unique index if not exists uq_assessment_taxonomies_primary
  on public.assessment_taxonomies(assessment_id)
  where is_primary = true;