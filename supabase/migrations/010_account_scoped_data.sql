alter table wallets add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table transactions add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table budget_categories add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table budget_rules add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table investment_config add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table estimation_plans add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table app_settings add column if not exists user_id uuid references auth.users(id) on delete cascade;

create index if not exists wallets_user_id_idx on wallets(user_id);
create index if not exists transactions_user_id_idx on transactions(user_id);
create index if not exists budget_categories_user_id_idx on budget_categories(user_id);
create index if not exists budget_rules_user_id_idx on budget_rules(user_id);
create index if not exists investment_config_user_id_idx on investment_config(user_id);
create index if not exists estimation_plans_user_id_idx on estimation_plans(user_id);
create index if not exists app_settings_user_id_idx on app_settings(user_id);

alter table wallets drop constraint if exists wallets_name_key;
alter table budget_categories drop constraint if exists budget_categories_name_key;

create unique index if not exists wallets_user_name_key on wallets(user_id, lower(name));
create unique index if not exists budget_categories_user_name_key on budget_categories(user_id, lower(name));
create unique index if not exists investment_config_user_key on investment_config(user_id);
create unique index if not exists app_settings_user_key on app_settings(user_id);
create unique index if not exists estimation_plans_user_month_year_key on estimation_plans(user_id, month, year);

alter table wallets enable row level security;
alter table transactions enable row level security;
alter table budget_categories enable row level security;
alter table budget_rules enable row level security;
alter table investment_config enable row level security;
alter table estimation_plans enable row level security;
alter table app_settings enable row level security;

drop policy if exists wallets_owner_access on wallets;
drop policy if exists transactions_owner_access on transactions;
drop policy if exists budget_categories_owner_access on budget_categories;
drop policy if exists budget_rules_owner_access on budget_rules;
drop policy if exists investment_config_owner_access on investment_config;
drop policy if exists estimation_plans_owner_access on estimation_plans;
drop policy if exists app_settings_owner_access on app_settings;

create policy wallets_owner_access on wallets
  for all to authenticated using (user_id = auth.uid() or user_id is null)
  with check (user_id = auth.uid());

create policy transactions_owner_access on transactions
  for all to authenticated using (user_id = auth.uid() or user_id is null)
  with check (user_id = auth.uid());

create policy budget_categories_owner_access on budget_categories
  for all to authenticated using (user_id = auth.uid() or user_id is null)
  with check (user_id = auth.uid());

create policy budget_rules_owner_access on budget_rules
  for all to authenticated using (user_id = auth.uid() or user_id is null)
  with check (user_id = auth.uid());

create policy investment_config_owner_access on investment_config
  for all to authenticated using (user_id = auth.uid() or user_id is null)
  with check (user_id = auth.uid());

create policy estimation_plans_owner_access on estimation_plans
  for all to authenticated using (user_id = auth.uid() or user_id is null)
  with check (user_id = auth.uid());

create policy app_settings_owner_access on app_settings
  for all to authenticated using (user_id = auth.uid() or user_id is null)
  with check (user_id = auth.uid());
