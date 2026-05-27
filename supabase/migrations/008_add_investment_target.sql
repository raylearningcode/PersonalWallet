alter table investment_config
  add column if not exists target_portfolio numeric not null default 0,
  add column if not exists target_currency text not null default 'IDR';
