-- Slot on running jobs + uniqueness so one named slot cannot double-book.
-- Direction candidates keep slot null and may run up to four in parallel.

alter table image_jobs
  add column if not exists slot text;

create index if not exists image_jobs_user_running_idx
  on image_jobs (user_id, project_id)
  where status = 'running';

create unique index if not exists image_jobs_running_named_slot_uidx
  on image_jobs (user_id, project_id, slot)
  where status = 'running' and slot is not null;
