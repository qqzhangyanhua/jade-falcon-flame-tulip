-- Soft-delete a studio project. Job rows stay; durable copies are removed in app code.
alter table studio_projects
  add column if not exists deleted_at timestamptz;

create index if not exists studio_projects_user_alive_idx
  on studio_projects (user_id)
  where deleted_at is null;
