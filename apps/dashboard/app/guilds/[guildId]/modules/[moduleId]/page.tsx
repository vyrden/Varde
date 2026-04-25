import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState, Separator } from '@varde/ui';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { ReactElement } from 'react';

import { auth } from '../../../../../auth';
import { ConfigForm } from '../../../../../components/ConfigForm';
import { moduleIcon } from '../../../../../components/shell/module-icons';
import {
  ApiError,
  fetchAdminGuilds,
  fetchModuleConfig,
  fetchModules,
} from '../../../../../lib/api-client';

interface ModuleConfigPageProps {
  readonly params: Promise<{ readonly guildId: string; readonly moduleId: string }>;
}

/**
 * Page de configuration d'un module pour une guild donnée. Charge
 * en parallèle le descripteur du module (pour le nom et le check
 * d'existence côté liste) et sa config + `configUi`. Le formulaire
 * est monté seulement si le module expose un `configUi` — sinon on
 * affiche un `EmptyState` explicite (module sans config éditable).
 *
 * Layout : header custom (breadcrumb + icône + titre + badge inline +
 * description), séparateur, puis grid 2/3 ↔ 1/3 (formulaire / sidebar
 * de métadonnées).
 */
export default async function ModuleConfigPage({
  params,
}: ModuleConfigPageProps): Promise<ReactElement> {
  const { guildId, moduleId } = await params;
  const session = await auth();
  if (!session?.user) redirect('/');

  let guilds: Awaited<ReturnType<typeof fetchAdminGuilds>>;
  let modules: Awaited<ReturnType<typeof fetchModules>>;
  let moduleConfig: Awaited<ReturnType<typeof fetchModuleConfig>>;
  try {
    [guilds, modules, moduleConfig] = await Promise.all([
      fetchAdminGuilds(),
      fetchModules(guildId),
      fetchModuleConfig(guildId, moduleId),
    ]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect('/');
    if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
      notFound();
    }
    throw error;
  }

  const guild = guilds.find((g) => g.id === guildId);
  const module = modules.find((m) => m.id === moduleId);
  if (!guild || !module) notFound();

  const isEnabled = module.enabled !== false;

  return (
    <>
      <header className="bg-surface px-6 pt-5 pb-4">
        <nav aria-label="Fil d'Ariane" className="mb-3 text-xs text-muted-foreground">
          <Link
            href={`/guilds/${guildId}`}
            className="font-medium uppercase tracking-wider hover:text-foreground"
          >
            Modules
          </Link>
          <span aria-hidden="true" className="mx-2">
            →
          </span>
          <span className="font-medium uppercase tracking-wider text-foreground">
            {module.name}
          </span>
        </nav>
        <div className="flex items-center gap-3">
          <div
            className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${
              isEnabled ? 'bg-primary/15 text-primary' : 'bg-surface-active text-muted-foreground'
            }`}
          >
            {moduleIcon(module.id, 20)}
          </div>
          <h1 className="text-[22px] font-bold leading-tight text-foreground">{module.name}</h1>
          <Badge variant={isEnabled ? 'active' : 'inactive'}>
            {isEnabled ? 'Actif' : 'Inactif'}
          </Badge>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {module.description || `Configuration du module ${module.name}.`}
        </p>
      </header>
      <Separator />
      <div className="mx-auto w-full max-w-6xl px-6 py-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="flex flex-col gap-4 lg:col-span-2">
            {moduleConfig.configUi && moduleConfig.configUi.fields.length > 0 ? (
              <ConfigForm
                guildId={guildId}
                moduleId={moduleId}
                moduleName={module.name}
                ui={moduleConfig.configUi}
                initialValues={moduleConfig.config}
                schema={moduleConfig.configSchema}
              />
            ) : (
              <EmptyState
                title="Module sans configuration éditable"
                description="Ce module n'expose pas de schéma de configuration. Rien à régler ici."
              />
            )}
          </div>

          <aside className="flex flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Informations</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Version</span>
                  <span className="font-mono text-foreground">v{module.version}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Statut</span>
                  <div className="flex items-center gap-3">
                    <span className="text-foreground">{isEnabled ? 'Actif' : 'Inactif'}</span>
                    {/* Décoration façon switch : l'état réel est annoncé
                        par le texte « Actif »/« Inactif » adjacent ; le
                        toggle n'est pas pilotable depuis ici. */}
                    <span
                      aria-hidden="true"
                      className={`relative inline-flex h-5.5 w-10 shrink-0 items-center rounded-full opacity-50 ${
                        isEnabled ? 'bg-success' : 'bg-[#4e5058]'
                      }`}
                    >
                      <span
                        className={`absolute top-0.75 left-0.75 h-4 w-4 rounded-full bg-white shadow ${
                          isEnabled ? 'translate-x-4.5' : 'translate-x-0'
                        }`}
                      />
                    </span>
                  </div>
                </div>
                <p className="pt-1 text-xs text-muted-foreground">
                  L'activation d'un module se pilote depuis la config du core. Cette page édite
                  uniquement ses paramètres.
                </p>
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>
    </>
  );
}
