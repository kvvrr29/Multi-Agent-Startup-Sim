-- Preserve any legacy metadata value only when the canonical scope/domain
-- memory entry is absent. Existing memory wins because it was the value used
-- by classification and AI workflows.
insert into public.memory_entries (project_id, category, key, value)
select id, 'scope', 'domain', to_jsonb(memory_domain)
from public.projects
where nullif(trim(memory_domain), '') is not null
on conflict (project_id, category, key) do nothing;

-- Project domain now lives only in the scope/domain memory entry. Keeping a
-- second projects.memory_domain copy caused drift and an extra metadata PATCH.
alter table public.projects drop column if exists memory_domain;
