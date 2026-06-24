-- Push token Expo pour les notifications mobiles
ALTER TABLE users ADD COLUMN IF NOT EXISTS push_token TEXT;
