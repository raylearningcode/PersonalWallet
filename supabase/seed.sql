insert into budget_categories (name, yearly_allocated, budget_period, color) values
  ('Housing', 0, 'monthly', '#A9F5C7'),
  ('Food', 0, 'monthly', '#FFD276'),
  ('Transport', 0, 'monthly', '#93C5FD'),
  ('Learning', 0, 'monthly', '#C4AEFF'),
  ('Entertainment', 0, 'monthly', '#FF8388'),
  ('Investing', 0, 'monthly', '#8B5CF6'),
  ('Income', 0, 'monthly', '#64748B')
on conflict (name) do nothing;

insert into wallets (name, type, balance, currency) values
  ('Cash', 'cash', 0, 'IDR'),
  ('Debit card', 'card', 0, 'IDR')
on conflict (name) do nothing;
