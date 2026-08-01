insert into public.memory_entries (project_id, category, key, value)
select id, 'scope', 'domain', to_jsonb(memory_domain)
from public.projects
where nullif(trim(memory_domain), '') is not null
on conflict (project_id, category, key) do nothing;
alter table public.projects drop column if exists memory_domain;
