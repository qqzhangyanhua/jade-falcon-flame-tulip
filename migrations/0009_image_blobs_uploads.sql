-- Uploaded wireframes are image_blobs rows that belong to no generation job.
alter table image_blobs alter column job_id drop not null;
alter table image_blobs add column if not exists kind text not null default 'job';
alter table image_blobs drop constraint if exists image_blobs_kind_check;
alter table image_blobs add constraint image_blobs_kind_check check (kind in ('job', 'upload'));
