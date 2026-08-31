-- 017_realtime_sync.sql
-- Adds every app table to the supabase_realtime publication so the
-- cross-device sync (desktop <-> Android) receives live postgres changes.
-- Idempotent: skips tables already in the publication.

do $$
declare
  t text;
begin
  foreach t in array array[
    'wallets',
    'transactions',
    'recurring_rules',
    'budget_categories',
    'budget_rules',
    'investment_config',
    'estimation_plans',
    'app_settings',
    'goals',
    'holdings',
    'dividend_logs'
  ]
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
