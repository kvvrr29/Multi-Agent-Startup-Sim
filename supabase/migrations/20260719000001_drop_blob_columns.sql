-- The client now reads/writes the normalized tables; the jsonb blob columns
-- are dead. Existing blob data is intentionally discarded (test data only).
alter table public.projects
  drop column project_state,
  drop column memory_state,
  drop column version_state;
