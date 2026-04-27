'use server';

import { type AuditFilters, type AuditPageDto, fetchAudit } from './api-client';

/**
 * Server action de chargement d'une page audit pour scroll infini.
 * Wrapper minimal autour de `fetchAudit` qui transmet la session de
 * l'admin connecté (les cookies sont propagés par `apiGet`). Appelé
 * depuis `AuditView` quand la sentinelle entre dans le viewport.
 */
export async function loadAuditPage(guildId: string, filters: AuditFilters): Promise<AuditPageDto> {
  return fetchAudit(guildId, filters);
}
