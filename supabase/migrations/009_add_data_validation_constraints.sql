do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'wallets_currency_allowed') then
    alter table wallets add constraint wallets_currency_allowed check (currency in ('USD', 'IDR', 'TWD', 'EUR', 'JPY')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'transactions_amount_nonnegative') then
    alter table transactions add constraint transactions_amount_nonnegative check (amount >= 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'transactions_original_amount_nonnegative') then
    alter table transactions add constraint transactions_original_amount_nonnegative check (original_amount >= 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'transactions_original_currency_allowed') then
    alter table transactions add constraint transactions_original_currency_allowed check (original_currency in ('USD', 'IDR', 'TWD', 'EUR', 'JPY')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'budget_categories_allocated_nonnegative') then
    alter table budget_categories add constraint budget_categories_allocated_nonnegative check (yearly_allocated >= 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'budget_rules_value_nonnegative') then
    alter table budget_rules add constraint budget_rules_value_nonnegative check (value >= 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'investment_config_values_valid') then
    alter table investment_config add constraint investment_config_values_valid check (
      monthly_contribution >= 0
      and target_portfolio >= 0
      and return_rate >= 0
      and duration_years >= 0
      and current_value >= 0
      and contribution_currency in ('USD', 'IDR', 'TWD', 'EUR', 'JPY')
      and target_currency in ('USD', 'IDR', 'TWD', 'EUR', 'JPY')
    ) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'estimation_plans_values_valid') then
    alter table estimation_plans add constraint estimation_plans_values_valid check (
      estimated_income >= 0
      and fixed_expenses >= 0
      and variable_estimate >= 0
      and currency in ('USD', 'IDR', 'TWD', 'EUR', 'JPY')
    ) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'app_settings_values_valid') then
    alter table app_settings add constraint app_settings_values_valid check (
      currency in ('USD', 'IDR', 'TWD', 'EUR', 'JPY')
      and base_currency in ('USD', 'IDR', 'TWD', 'EUR', 'JPY')
      and annual_goal_pct between 0 and 100
    ) not valid;
  end if;
end $$;
