-- Blueprint rows are created on first approved-section upsert. Empty seeded
-- placeholders add storage and make every blueprint read return 18 useless
-- rows, so remove the existing placeholders and stop creating new ones.
delete from public.blueprint_sections
where content = ''
  and status = 'pending'
  and generation_source is null
  and generated_by is null
  and validation_scores is null
  and generated_at is null
  and failure_reason is null;
