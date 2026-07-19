-- Normalize project storage: intake form + memory domain move onto projects,
-- and blueprint sections, versions, workflow events, memory entries and
-- decision history each get their own table. The old jsonb blob columns
-- (project_state, memory_state, version_state) are dropped in a follow-up
-- migration once the client cutover is verified.

-- ---------- projects: intake form + open tracking ----------

alter table public.projects
  add column idea text not null default '',
  add column target_audience text not null default '',
  add column budget text not null default '',
  add column timeline text not null default '',
  add column platform text not null default 'web',
  add column team_size text not null default '',
  add column priorities text not null default '',
  add column memory_domain text not null default '',
  add column current_version_label text,
  add column last_opened_at timestamptz;

create index projects_user_last_opened_idx
  on public.projects (user_id, last_opened_at desc nulls last, updated_at desc);

-- ---------- blueprint_sections: one row per section per project ----------

create table public.blueprint_sections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  section_key text not null,
  content text not null default '',
  status text not null default 'pending' check (status in ('pending', 'approved')),
  last_modified_version text not null default 'v1',
  generation_source text,
  generated_by text,
  validation_scores jsonb,
  generated_at timestamptz,
  failure_reason text,
  updated_at timestamptz not null default now(),
  unique (project_id, section_key)
);

-- ---------- versions: immutable snapshots (snapshot payloads stay jsonb) ----------

create table public.versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  version_number int not null,
  summary text not null default '',
  change_type text not null default 'revision',
  completion_status text not null default 'success',
  affected_agents text[] not null default '{}',
  affected_sections text[] not null default '{}',
  approval_state jsonb not null default '{}'::jsonb,
  blueprint_snapshot jsonb not null default '{}'::jsonb,
  memory_snapshot jsonb,
  provenance_snapshot jsonb,
  restored_from text,
  created_at timestamptz not null default now(),
  unique (project_id, version_number)
);

-- ---------- workflow_events: append-only timeline ----------

create table public.workflow_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  client_id text not null,
  event_type text,
  agent_id text,
  occurred_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  unique (project_id, client_id)
);

create index workflow_events_project_time_idx
  on public.workflow_events (project_id, occurred_at);

-- ---------- memory_entries: agent memory key/value per category ----------

create table public.memory_entries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  category text not null check (category in ('business', 'product', 'technical', 'marketing', 'scope')),
  key text not null,
  value jsonb,
  updated_at timestamptz not null default now(),
  unique (project_id, category, key)
);

-- ---------- decision_entries: append-only decision history ----------

create table public.decision_entries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  client_id text not null,
  category text,
  key text,
  value jsonb,
  agent text,
  instruction text,
  version_label text,
  decided_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  unique (project_id, client_id)
);

create index decision_entries_project_time_idx
  on public.decision_entries (project_id, decided_at);

-- ---------- RLS: every child row is visible iff its project belongs to the user ----------

alter table public.blueprint_sections enable row level security;
alter table public.versions enable row level security;
alter table public.workflow_events enable row level security;
alter table public.memory_entries enable row level security;
alter table public.decision_entries enable row level security;

create policy "Users can view own blueprint sections" on public.blueprint_sections for select
  using (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()));
create policy "Users can create own blueprint sections" on public.blueprint_sections for insert
  with check (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()));
create policy "Users can update own blueprint sections" on public.blueprint_sections for update
  using (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()));
create policy "Users can delete own blueprint sections" on public.blueprint_sections for delete
  using (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()));

create policy "Users can view own versions" on public.versions for select
  using (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()));
create policy "Users can create own versions" on public.versions for insert
  with check (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()));
create policy "Users can update own versions" on public.versions for update
  using (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()));
create policy "Users can delete own versions" on public.versions for delete
  using (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()));

create policy "Users can view own workflow events" on public.workflow_events for select
  using (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()));
create policy "Users can create own workflow events" on public.workflow_events for insert
  with check (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()));
create policy "Users can update own workflow events" on public.workflow_events for update
  using (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()));
create policy "Users can delete own workflow events" on public.workflow_events for delete
  using (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()));

create policy "Users can view own memory entries" on public.memory_entries for select
  using (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()));
create policy "Users can create own memory entries" on public.memory_entries for insert
  with check (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()));
create policy "Users can update own memory entries" on public.memory_entries for update
  using (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()));
create policy "Users can delete own memory entries" on public.memory_entries for delete
  using (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()));

create policy "Users can view own decision entries" on public.decision_entries for select
  using (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()));
create policy "Users can create own decision entries" on public.decision_entries for insert
  with check (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()));
create policy "Users can update own decision entries" on public.decision_entries for update
  using (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()));
create policy "Users can delete own decision entries" on public.decision_entries for delete
  using (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()));

-- ---------- updated_at triggers (reuses public.set_updated_at from the projects migration) ----------

create trigger blueprint_sections_set_updated_at
  before update on public.blueprint_sections
  for each row execute function public.set_updated_at();

create trigger memory_entries_set_updated_at
  before update on public.memory_entries
  for each row execute function public.set_updated_at();
