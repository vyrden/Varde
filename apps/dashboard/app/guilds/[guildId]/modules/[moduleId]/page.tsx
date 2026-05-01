import { Card, CardContent, CardHeader, CardTitle, EmptyState } from '@varde/ui';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import type { ReactElement } from 'react';

import { auth } from '../../../../../auth';
import { ConfigForm } from '../../../../../components/ConfigForm';
import { ModuleConfigHeader } from '../../../../../components/module-config/ModuleConfigHeader';
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
 * Page de configuration générique d'un module (jalon 7 PR 7.4.8).
 * Surface utilisée pour tout module qui s'appuie sur le rendu
 * automatique depuis `configUi` ; les modules officiels (welcome,
 * moderation, logs, reaction-roles) gardent leurs UI custom et
 * seront harmonisés progressivement dans des PR séparées.
 *
 * Layout :
 *
 * - Header standardisé (`<ModuleConfigHeader>`) : breadcrumb,
 *   icône, nom, badges actif/inactif + version, actions pin et
 *   toggle on/off.
 * - Formulaire généré par `<ConfigForm>` (refactoré PR 7.4.8 pour
 *   utiliser `<StickyActionBar>` du DS avec dirty tracking +
 *   compteur de modifications).
 * - Carte « Informations » à droite : version + note explicative
 *   sur l'effet du toggle.
 *
 * Le module sans `configUi` exposé voit un EmptyState — pas de
 * formulaire à générer côté UI, le module reste utilisable côté
 * runtime via les valeurs par défaut.
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

  const t = await getTranslations('moduleConfig');

  return (
    <>
      <ModuleConfigHeader
        guildId={guildId}
        module={{
          id: module.id,
          name: module.name,
          version: module.version,
          description: module.description,
          shortDescription: module.shortDescription,
          enabled: module.enabled,
          isPinned: module.isPinned,
        }}
      />
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
              <EmptyState title={t('noConfigTitle')} description={t('noConfigDescription')} />
            )}
          </div>

          <aside className="flex flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle>{t('infoCard.title')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t('infoCard.versionLabel')}</span>
                  <span className="font-mono text-foreground">v{module.version}</span>
                </div>
                <p className="pt-1 text-xs text-muted-foreground">{t('infoCard.toggleNote')}</p>
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>
    </>
  );
}
