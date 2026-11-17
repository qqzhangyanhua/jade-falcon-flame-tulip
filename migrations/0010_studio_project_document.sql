-- The Project Document is the server-held, authoritative copy of a project's full state.
-- version is the optimistic-concurrency token; updated_at stays null until the first save.
alter table studio_projects add column if not exists document jsonb;
alter table studio_projects add column if not exists version integer not null default 0;
alter table studio_projects add column if not exists updated_at timestamptz;
