create index if not exists transactions_wallet_id_idx
  on transactions(wallet_id);

create index if not exists transactions_transfer_wallet_id_idx
  on transactions(transfer_wallet_id);
