-- Upstream fee for one image job. 1 USD = 10000000000 ticks. Null when usage was absent.
alter table image_jobs
  add column if not exists cost_in_usd_ticks bigint;
