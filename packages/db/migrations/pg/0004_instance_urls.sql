-- Jalon 7 PR 7.2 — colonnes `base_url` + `additional_urls` sur
-- `instance_config`.
--
-- `base_url` (nullable) : URL d'accès principale au dashboard, telle
-- que persistée par l'admin via `PUT /admin/urls/base`. Quand NULL,
-- l'instance retombe sur la valeur d'environnement (`BASE_URL` ou
-- l'auto-détection localhost). Une fois posée, elle prime sur
-- l'environnement — c'est précisément la valeur que l'admin a
-- saisie dans la page « URLs d'accès ».
--
-- `additional_urls` (jsonb) : liste d'URLs additionnelles d'accès
-- au dashboard (LAN, second domaine, tunnel ngrok…). Chaque entrée
-- est `{ id: string (uuid), url: string, label?: string }`. Stockée
-- en JSON dans la ligne singleton plutôt qu'en table séparée — le
-- volume est borné à quelques URLs par instance et la requête
-- naturelle est « lis-moi tout ». Default `[]` pour qu'une lecture
-- avant tout admin renvoie la forme attendue sans NULL.

ALTER TABLE "instance_config"
	ADD COLUMN "base_url" text;

ALTER TABLE "instance_config"
	ADD COLUMN "additional_urls" jsonb NOT NULL DEFAULT '[]'::jsonb;
