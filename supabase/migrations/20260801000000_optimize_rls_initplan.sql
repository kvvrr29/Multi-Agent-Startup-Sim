-- Wrap auth.uid() as (select auth.uid()) in every RLS policy.
--
-- A bare auth.uid() is volatile from the planner's perspective and is
-- re-evaluated once per row; as a scalar subquery it becomes an InitPlan
-- evaluated once per query. This is Supabase linter 0003_auth_rls_initplan and
-- matters most on workflow_events, the highest-volume table.
--
-- The predicates are otherwise unchanged, so access control is identical.
-- ALTER POLICY is used rather than drop/create so no policy is ever absent.

-- projects: ownership is direct.
alter policy "Users can view own projects" on public.projects
  using ((select auth.uid()) = user_id);
alter policy "Users can create own projects" on public.projects
  with check ((select auth.uid()) = user_id);
alter policy "Users can update own projects" on public.projects
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
alter policy "Users can delete own projects" on public.projects
  using ((select auth.uid()) = user_id);

-- blueprint_sections: ownership is inherited through the parent project.
alter policy "Users can view own blueprint sections" on public.blueprint_sections
  using (exists (select 1 from public.projects p
    where p.id = blueprint_sections.project_id and p.user_id = (select auth.uid())));
alter policy "Users can create own blueprint sections" on public.blueprint_sections
  with check (exists (select 1 from public.projects p
    where p.id = blueprint_sections.project_id and p.user_id = (select auth.uid())));
alter policy "Users can update own blueprint sections" on public.blueprint_sections
  using (exists (select 1 from public.projects p
    where p.id = blueprint_sections.project_id and p.user_id = (select auth.uid())))
  with check (exists (select 1 from public.projects p
    where p.id = blueprint_sections.project_id and p.user_id = (select auth.uid())));
alter policy "Users can delete own blueprint sections" on public.blueprint_sections
  using (exists (select 1 from public.projects p
    where p.id = blueprint_sections.project_id and p.user_id = (select auth.uid())));

alter policy "Users can view own workflow events" on public.workflow_events
  using (exists (select 1 from public.projects p
    where p.id = workflow_events.project_id and p.user_id = (select auth.uid())));
alter policy "Users can create own workflow events" on public.workflow_events
  with check (exists (select 1 from public.projects p
    where p.id = workflow_events.project_id and p.user_id = (select auth.uid())));
alter policy "Users can update own workflow events" on public.workflow_events
  using (exists (select 1 from public.projects p
    where p.id = workflow_events.project_id and p.user_id = (select auth.uid())))
  with check (exists (select 1 from public.projects p
    where p.id = workflow_events.project_id and p.user_id = (select auth.uid())));
alter policy "Users can delete own workflow events" on public.workflow_events
  using (exists (select 1 from public.projects p
    where p.id = workflow_events.project_id and p.user_id = (select auth.uid())));

alter policy "Users can view own memory entries" on public.memory_entries
  using (exists (select 1 from public.projects p
    where p.id = memory_entries.project_id and p.user_id = (select auth.uid())));
alter policy "Users can create own memory entries" on public.memory_entries
  with check (exists (select 1 from public.projects p
    where p.id = memory_entries.project_id and p.user_id = (select auth.uid())));
alter policy "Users can update own memory entries" on public.memory_entries
  using (exists (select 1 from public.projects p
    where p.id = memory_entries.project_id and p.user_id = (select auth.uid())))
  with check (exists (select 1 from public.projects p
    where p.id = memory_entries.project_id and p.user_id = (select auth.uid())));
alter policy "Users can delete own memory entries" on public.memory_entries
  using (exists (select 1 from public.projects p
    where p.id = memory_entries.project_id and p.user_id = (select auth.uid())));

alter policy "Users can view own decision entries" on public.decision_entries
  using (exists (select 1 from public.projects p
    where p.id = decision_entries.project_id and p.user_id = (select auth.uid())));
alter policy "Users can create own decision entries" on public.decision_entries
  with check (exists (select 1 from public.projects p
    where p.id = decision_entries.project_id and p.user_id = (select auth.uid())));
alter policy "Users can update own decision entries" on public.decision_entries
  using (exists (select 1 from public.projects p
    where p.id = decision_entries.project_id and p.user_id = (select auth.uid())))
  with check (exists (select 1 from public.projects p
    where p.id = decision_entries.project_id and p.user_id = (select auth.uid())));
alter policy "Users can delete own decision entries" on public.decision_entries
  using (exists (select 1 from public.projects p
    where p.id = decision_entries.project_id and p.user_id = (select auth.uid())));
