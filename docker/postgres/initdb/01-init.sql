-- Script d'initialisation appliqué au premier démarrage du volume
-- Postgres (le dossier docker-entrypoint-initdb.d ne s'exécute que si
-- le data directory est vide).
--
-- Les migrations applicatives (Drizzle, à partir du jalon 1) ajoutent
-- les schémas métier. Ce script se limite aux extensions et éléments
-- qui ne peuvent pas venir de l'application.

-- Extensions utiles. pgcrypto est installée par précaution même si les
-- identifiants applicatifs sont des ULID générés côté app.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Rôle applicatif non-superuser. Désactivé par défaut en dev : le user
-- défini par POSTGRES_USER est déjà superuser et suffit. Activer pour
-- un déploiement proche de la prod en décommentant les lignes et en
-- ajustant le mot de passe.
--
-- CREATE ROLE varde_app LOGIN PASSWORD 'varde_app';
-- GRANT CONNECT ON DATABASE varde TO varde_app;
-- GRANT USAGE ON SCHEMA public TO varde_app;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO varde_app;
-- ALTER DEFAULT PRIVILEGES IN SCHEMA public
--   GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO varde_app;
