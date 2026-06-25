-- Transferts de parts de dépôt de garantie entre colocs
-- from_user_id : coloc qui part (reçoit le remboursement de son remplaçant)
-- to_user_id   : remplaçant (prend en charge la part)
CREATE TABLE IF NOT EXISTS deposit_transfers (
  id             UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id       UUID           NOT NULL REFERENCES groups(id)  ON DELETE CASCADE,
  from_user_id   UUID           NOT NULL REFERENCES users(id)   ON DELETE RESTRICT,
  to_user_id     UUID           NOT NULL REFERENCES users(id)   ON DELETE RESTRICT,
  amount         NUMERIC(10, 2) NOT NULL,
  transferred_at TIMESTAMPTZ    DEFAULT now(),
  created_at     TIMESTAMPTZ    DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deposit_transfers_group ON deposit_transfers(group_id);
CREATE INDEX IF NOT EXISTS idx_deposit_transfers_from  ON deposit_transfers(from_user_id);
CREATE INDEX IF NOT EXISTS idx_deposit_transfers_to    ON deposit_transfers(to_user_id);
