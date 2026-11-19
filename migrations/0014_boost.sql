-- Non-expiring 加量包. No row means balance 0.
-- Spent only after that user's Beijing-day cap is full. A failed job does not refund it.

create table if not exists user_boost_balances (
  user_id text primary key references "user" ("id") on delete cascade,
  balance integer not null,
  constraint user_boost_balances_nonneg check (balance >= 0)
);

-- One row per grant and one row per debit.
-- amount is a positive count. admin_id is the granting admin and is null on a debit.
-- note is the admin remark on a grant, and the image job id on a debit.

create table if not exists user_boost_ledger (
  id bigserial primary key,
  user_id text not null references "user" ("id") on delete cascade,
  kind text not null check (kind in ('grant', 'debit')),
  amount integer not null check (amount > 0),
  created_at timestamptz not null,
  admin_id text,
  note text not null default ''
);

create index if not exists user_boost_ledger_user_created
  on user_boost_ledger (user_id, created_at, id);
