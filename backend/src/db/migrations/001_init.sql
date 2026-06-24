-- Schéma initial Coloc'

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT,
  lease_start_date DATE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member', -- 'creator' | 'member'
  active BOOLEAN DEFAULT true,
  joined_at TIMESTAMPTZ DEFAULT now(),
  left_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
  paid_by UUID REFERENCES users(id),
  amount NUMERIC(10, 2) NOT NULL,
  category TEXT NOT NULL, -- 'electricite' | 'courses' | 'internet' | 'autre'
  split_type TEXT NOT NULL DEFAULT 'equal', -- 'equal' | 'prorata'
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS expense_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id UUID REFERENCES expenses(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  share_ratio NUMERIC(5, 4) NOT NULL, -- ex: 0.3333 pour 1/3
  amount_owed NUMERIC(10, 2) NOT NULL
);

CREATE TABLE IF NOT EXISTS deposits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  amount_contributed NUMERIC(10, 2) NOT NULL,
  contributed_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expenses_group ON expenses(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_group ON group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_expense_shares_expense ON expense_shares(expense_id);
