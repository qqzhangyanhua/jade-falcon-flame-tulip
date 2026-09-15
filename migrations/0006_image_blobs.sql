-- App-owned image bytes. Successful jobs persist a copy here; failed jobs do not.
create table if not exists image_blobs (
  id text primary key,
  user_id text not null,
  project_id text not null,
  job_id text not null,
  content_type text not null,
  bytes bytea not null,
  created_at timestamptz not null default now()
);
create index if not exists image_blobs_job_id_idx on image_blobs (job_id);
create index if not exists image_blobs_user_id_idx on image_blobs (user_id);
