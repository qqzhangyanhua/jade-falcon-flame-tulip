-- One row is a user's own daily image cap. It overrides studio_settings.daily_image_cap,
-- including when the value is 0. No row means the user follows the global cap.
-- Delete the row to clear the override.

create table if not exists user_daily_caps (
  user_id text primary key references "user" ("id") on delete cascade,
  cap integer not null,
  constraint user_daily_caps_cap_range check (cap >= 0 and cap <= 9999)
);
