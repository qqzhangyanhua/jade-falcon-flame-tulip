create table if not exists model_catalog (
  id text primary key,
  kind text not null,
  display_name text not null,
  upstream_id text not null,
  enabled boolean not null default true,
  capabilities text not null default '',
  is_admin_default boolean not null default false
);

insert into model_catalog (
  id, kind, display_name, upstream_id, enabled, capabilities, is_admin_default
) values
  (
    'mdl-imagine-2',
    'image',
    'Grok Imagine 2.0',
    'grok-imagine-image-2.0',
    true,
    'direction,generate,tune,compose',
    true
  ),
  (
    'mdl-grok-chat',
    'chat',
    'Grok 4.5',
    'grok-4.5',
    true,
    '',
    false
  )
on conflict (id) do nothing;

create table if not exists studio_projects (
  id text primary key,
  user_id text not null,
  current_image_model_id text not null,
  created_at timestamptz not null default now()
);
create index if not exists studio_projects_user_id_idx on studio_projects (user_id);

create table if not exists image_jobs (
  id text primary key,
  user_id text not null,
  project_id text not null,
  action text not null,
  catalog_model_id text not null,
  upstream_model_id text not null,
  display_name_snapshot text not null,
  status text not null,
  error_code text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists image_jobs_project_id_idx on image_jobs (project_id);

create table if not exists image_revs (
  id text primary key,
  job_id text not null,
  project_id text not null,
  user_id text not null,
  url text not null,
  action text not null,
  created_at timestamptz not null default now()
);
create index if not exists image_revs_job_id_idx on image_revs (job_id);
