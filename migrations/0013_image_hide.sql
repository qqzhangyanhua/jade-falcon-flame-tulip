-- Hidden images stay in image_blobs. The flag stops every byte API, including the owner.
alter table image_blobs add column if not exists hidden boolean not null default false;

-- One row per hide or unhide. The image row is not removed.
create table if not exists image_hide_audit (
  id text primary key,
  image_id text not null,
  action text not null check (action in ('hide', 'unhide')),
  admin_id text not null,
  reason text,
  created_at timestamptz not null
);

create index if not exists image_hide_audit_image_idx
  on image_hide_audit (image_id, created_at);
