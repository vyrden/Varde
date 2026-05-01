-- Jalon 7 PR 7.8 — bannière du bot Discord (PATCH /users/@me banner).
-- Colonne URL CDN renvoyée par Discord après upload, persistée
-- non chiffrée (image publique côté Discord, pas un secret).

-- SQLite: ALTER TABLE ne supporte pas IF NOT EXISTS, mais drizzle
-- skippera la migration si son hash est déjà dans __drizzle_migrations.
ALTER TABLE "instance_config" ADD COLUMN "bot_banner_url" text;
