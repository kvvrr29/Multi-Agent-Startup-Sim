
drop table if exists public.versions;

alter table public.projects drop column if exists current_version_label;
alter table public.blueprint_sections drop column if exists last_modified_version;
alter table public.decision_entries drop column if exists version_label;
