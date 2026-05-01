-- Jalon 7 PR 7.8 — bannière du bot Discord (PATCH /users/@me banner).
-- Colonne URL CDN renvoyée par Discord après upload, persistée
-- non chiffrée (image publique côté Discord, pas un secret).

ALTER TABLE "instance_config" ADD COLUMN IF NOT EXISTS "bot_banner_url" text;
