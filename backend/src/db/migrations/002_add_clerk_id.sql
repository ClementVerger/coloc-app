-- Lier les utilisateurs Coloc' aux identifiants Clerk
ALTER TABLE users ADD COLUMN IF NOT EXISTS clerk_id TEXT UNIQUE;
