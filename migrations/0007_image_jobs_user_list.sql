create index if not exists image_jobs_user_created_idx
  on image_jobs (user_id, created_at desc);
