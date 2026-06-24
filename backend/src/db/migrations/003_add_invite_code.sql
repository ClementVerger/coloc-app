-- Code d'invitation court (6 caractères) pour rejoindre une coloc sans saisir l'UUID
ALTER TABLE groups ADD COLUMN IF NOT EXISTS invite_code TEXT UNIQUE;
