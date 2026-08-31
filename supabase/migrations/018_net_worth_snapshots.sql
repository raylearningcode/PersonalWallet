-- 018_net_worth_snapshots.sql
-- Monthly net-worth anchor points. The app upserts the current month's value
-- on the Dashboard and uses these anchors for the 6-month curve, so the
-- history stays accurate even when wallet balances are edited directly.

create table if not exists net_worth_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  month text not null,            -- 'YYYY-MM'
  value numeric not null,
  created_at timestamptz default now(),
  constraint net_worth_snapshots_user_month_key unique (user_id, month)
);

alter table net_worth_snapshots enable row level security;

drop policy if exists net_worth_snapshots_owner_access on net_worth_snapshots;
create policy net_worth_snapshots_owner_access on net_worth_snapshots
  for all to authenticated
  using (user_id = auth.uid());
