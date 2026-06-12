alter table investment_config
  add column if not exists contribution_currency text not null default 'IDR';
