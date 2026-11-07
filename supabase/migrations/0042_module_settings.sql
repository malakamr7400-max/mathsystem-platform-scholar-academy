-- 0042: Persist generic assessment module/section settings.
--
-- The Assessment Studio supports settings beyond the normalized delivery columns
-- (for example calculator policy, backtracking, required-answer behavior, and
-- break configuration). Keep the dedicated delivery columns for indexed/runtime
-- fields, and store the complete generic settings object alongside them.
alter table public.modules
  add column if not exists settings jsonb not null default '{}'::jsonb;
