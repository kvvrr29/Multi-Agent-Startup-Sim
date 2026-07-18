-- Cloud persistence for the Multi-Agent Startup Simulator.
-- One row per startup project; jsonb columns mirror the client's Zustand store slices.
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null default 'Untitled Project',
  project_state jsonb not null default '{}'::jsonb,
  memory_state jsonb not null default '{}'::jsonb,
  version_state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.projects enable row level security;

create policy "Users can view own projects"
  on public.projects for select using (auth.uid() = user_id);
create policy "Users can create own projects"
  on public.projects for insert with check (auth.uid() = user_id);
create policy "Users can update own projects"
  on public.projects for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete own projects"
  on public.projects for delete using (auth.uid() = user_id);

create index projects_user_updated_idx on public.projects (user_id, updated_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();
