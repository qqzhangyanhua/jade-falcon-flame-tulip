-- Global daily image cap (one number for every user) and per-user Beijing-day usage.
-- Reservation happens in the same statement as inserting a running image job.

create table if not exists studio_settings (
  key text primary key,
  value text not null
);

insert into studio_settings (key, value)
values ('daily_image_cap', '30')
on conflict (key) do nothing;

-- Assign administrators here (not a second auth system):
--   insert into studio_roles (user_id, role) values ('<user-id>', 'admin');
create table if not exists studio_roles (
  user_id text primary key,
  role text not null check (role in ('user', 'admin'))
);

create table if not exists image_quota_days (
  user_id text not null,
  beijing_day date not null,
  used integer not null default 0,
  constraint image_quota_days_used_nonneg check (used >= 0),
  primary key (user_id, beijing_day)
);
