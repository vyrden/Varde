import type { OwnershipService } from '@varde/core';
import type { FastifyInstance, FastifyRequest } from 'fastify';

import type { SessionData } from '../server.js';

/**
 * Garde-fou pour les routes `/admin/*` (jalon 7 PR 7.2). Vérifie
 * que l'appelant est :
 *
 * 1. Authentifié (cookie de session valide).
 * 2. Inscrit comme owner dans `instance_owners`.
 *
 * Codes d'erreur :
 *
 * - **401** si aucune session n'est attachée à la requête. Le
 *   `setErrorHandler` global de `createApiServer` réécrit cette
 *   erreur en `{ error: 'unauthenticated' }` (canal stable côté
 *   dashboard pour déclencher un sign-in). Cette propagation est
 *   faite via `app.ensureSession` qui jette un `{ statusCode: 401 }`.
 * - **404** si la session existe mais l'user n'est pas owner. Choix
 *   délibéré (cf. plan PR2-admin instance.md) : on ne révèle pas
 *   l'existence de l'arborescence admin à un user non habilité.
 *
 * Retourne la `SessionData` à la route appelante en cas de succès,
 * pour qu'elle puisse logger l'identité de l'owner en charge sans
 * refaire un appel.
 */
export async function requireOwner(
  app: FastifyInstance,
  request: FastifyRequest,
  ownership: OwnershipService,
): Promise<SessionData> {
  const session = await app.ensureSession(request);
  if (typeof session.userId !== 'string' || session.userId.length === 0) {
    // Forme défensive : `ensureSession` retourne déjà une session
    // valide en théorie. Si elle est tronquée (userId vide) on
    // refuse comme un non-owner pour ne pas crasher.
    const err: Error & { statusCode?: number; code?: string } = new Error('Not Found');
    err.statusCode = 404;
    err.code = 'not_found';
    throw err;
  }
  if (!(await ownership.isOwner(session.userId))) {
    const err: Error & { statusCode?: number; code?: string } = new Error('Not Found');
    err.statusCode = 404;
    err.code = 'not_found';
    throw err;
  }
  return session;
}
