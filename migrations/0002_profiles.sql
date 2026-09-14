create table if not exists profiles (
  user_id      text primary key,
  display_name text not null default '',
  title        text not null default '',
  bio          text not null default '',
  updated_at   timestamptz not null default now()
);
