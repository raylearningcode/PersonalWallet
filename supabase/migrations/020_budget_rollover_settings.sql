alter table budget_categories
  add column if not exists reset_frequency text not null default 'monthly',
  add column if not exists reset_start_day integer not null default 1,
  add column if not exists rollover_enabled boolean not null default false,
  add column if not exists rollover_mode text not null default 'all_unused',
  add column if not exists rollover_cap numeric;

alter table budget_categories
  add constraint budget_categories_reset_frequency_check
  check (reset_frequency in ('monthly', 'yearly')) not valid;

alter table budget_categories
  add constraint budget_categories_reset_start_day_check
  check (reset_start_day between 1 and 31) not valid;

alter table budget_categories
  add constraint budget_categories_rollover_mode_check
  check (rollover_mode in ('all_unused', 'custom_cap')) not valid;

alter table budget_categories
  add constraint budget_categories_rollover_cap_nonnegative_check
  check (rollover_cap is null or rollover_cap >= 0) not valid;

update budget_categories
set reset_frequency = coalesce(budget_period, 'monthly')
where budget_period is not null;
