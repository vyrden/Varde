import type { GuildId, UserId } from '@varde/contracts';
import { ValidationError } from '@varde/contracts';
import type { GuildPermissionsService, UserPreferencesService } from '@varde/core';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { requireGuildAccess } from '../middleware/require-guild-access.js';

/**
 * Routes des préférences utilisateur (jalon 7 PR 7.4.1).
 *
 * Quatre endpoints, tous derrière `ensureSession`. Les routes
 * `/me/guilds/:guildId/*` exigent en plus un accès au moins
 * `'moderator'` à la guild — un user qui ne peut pas voir le
 * dashboard de la guild ne peut évidemment pas y épingler de
 * modules.
 *
 * Validation côté service (`userPreferencesService`) pour les
 * règles métier (theme enum, max 8 pins, doublons, positions). Le
 * route ajoute uniquement la vérification que les `moduleId`
 * existent sur l'instance — la liste vient de l'injecteur
 * `listKnownModuleIds`. Les modules supprimés post-pin sont gérés
 * en background (cf. PR 7.4.10), pas ici.
 */

const preferencesPatchSchema = z.object({
  theme: z.enum(['system', 'light', 'dark']).optional(),
  locale: z.string().min(1).max(16).optional(),
});

const pinnedModulesSchema = z.object({
  pinnedModules: z.array(
    z.object({
      moduleId: z.string().min(1).max(64),
      position: z.number().int().min(0).max(255),
    }),
  ),
});

/** Forme retournée par les routes globales. */
export interface UserPreferencesResponse {
  readonly theme: 'system' | 'light' | 'dark';
  readonly locale: string;
}

/** Forme retournée par les routes guild-scopées. */
export interface UserGuildPreferencesResponse {
  readonly pinnedModules: readonly { moduleId: string; position: number }[];
}

export interface RegisterUserPreferencesRoutesOptions {
  readonly userPreferences: UserPreferencesService;
  readonly guildPermissions: GuildPermissionsService;
  /**
   * Liste des `moduleId` chargés par le loader. Sert à valider
   * qu'un pin référence un module connu de l'instance. Injectée par
   * le runtime — en tests : un tableau littéral.
   */
  readonly listKnownModuleIds: () => readonly string[];
}

const httpError = (
  statusCode: number,
  code: string,
  message: string,
  details?: unknown,
): Error & { statusCode: number; code: string; details?: unknown } => {
  const err = new Error(message) as Error & {
    statusCode: number;
    code: string;
    details?: unknown;
  };
  err.statusCode = statusCode;
  err.code = code;
  if (details !== undefined) err.details = details;
  return err;
};

export function registerUserPreferencesRoutes(
  app: FastifyInstance,
  options: RegisterUserPreferencesRoutesOptions,
): void {
  const { userPreferences, guildPermissions, listKnownModuleIds } = options;

  app.get('/me/preferences', async (request): Promise<UserPreferencesResponse> => {
    const session = await app.ensureSession(request);
    const prefs = await userPreferences.getPreferences(session.userId as UserId);
    return { theme: prefs.theme, locale: prefs.locale };
  });

  // public-route: préférences globales d'un user, pas guild-scopées.
  // Auth requise (ensureSession), mais pas de garde de niveau guild.
  app.put('/me/preferences', async (request): Promise<UserPreferencesResponse> => {
    const session = await app.ensureSession(request);
    const parsed = preferencesPatchSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      throw httpError(400, 'invalid_body', 'Body invalide.', parsed.error.issues);
    }
    // Reconstitution explicite : `exactOptionalPropertyTypes` rejette
    // les `undefined` portés par les clés optionnelles. On omet la
    // clé plutôt que d'envoyer `{ theme: undefined }`.
    const patch: { theme?: 'system' | 'light' | 'dark'; locale?: string } = {};
    if (parsed.data.theme !== undefined) patch.theme = parsed.data.theme;
    if (parsed.data.locale !== undefined) patch.locale = parsed.data.locale;
    try {
      const next = await userPreferences.updatePreferences(session.userId as UserId, patch);
      return { theme: next.theme, locale: next.locale };
    } catch (error) {
      if (error instanceof ValidationError) {
        throw httpError(400, 'invalid_body', error.message);
      }
      throw error;
    }
  });

  app.get<{ Params: { guildId: string } }>(
    '/me/guilds/:guildId/preferences',
    async (request): Promise<UserGuildPreferencesResponse> => {
      const { guildId } = request.params;
      const session = await requireGuildAccess(
        app,
        request,
        guildId as GuildId,
        guildPermissions,
        'moderator',
      );
      const prefs = await userPreferences.getGuildPreferences(
        session.userId as UserId,
        guildId as GuildId,
      );
      return { pinnedModules: prefs.pinnedModules.map((p) => ({ ...p })) };
    },
  );

  app.put<{ Params: { guildId: string } }>(
    '/me/guilds/:guildId/preferences/pins',
    async (request): Promise<UserGuildPreferencesResponse> => {
      const { guildId } = request.params;
      const session = await requireGuildAccess(
        app,
        request,
        guildId as GuildId,
        guildPermissions,
        'moderator',
      );
      const parsed = pinnedModulesSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        throw httpError(400, 'invalid_body', 'Body invalide.', parsed.error.issues);
      }
      const knownIds = new Set(listKnownModuleIds());
      const unknown = parsed.data.pinnedModules
        .map((p) => p.moduleId)
        .filter((id) => !knownIds.has(id));
      if (unknown.length > 0) {
        throw httpError(
          422,
          'unknown_module_ids',
          "Certains modules épinglés n'existent pas sur cette instance.",
          { unknown },
        );
      }
      try {
        const next = await userPreferences.updatePinnedModules(
          session.userId as UserId,
          guildId as GuildId,
          parsed.data.pinnedModules,
        );
        return { pinnedModules: next.pinnedModules.map((p) => ({ ...p })) };
      } catch (error) {
        if (error instanceof ValidationError) {
          throw httpError(422, 'invalid_pins', error.message);
        }
        throw error;
      }
    },
  );
}
