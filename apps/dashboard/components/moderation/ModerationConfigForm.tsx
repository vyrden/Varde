'use client';

import { Button, Card, CardContent, CardHeader, CardTitle, Select, Toggle } from '@varde/ui';
import { type ReactElement, useState, useTransition } from 'react';

import { saveModuleConfig } from '../../lib/actions';

interface RoleOption {
  readonly id: string;
  readonly name: string;
}

export interface ModerationConfigFormProps {
  readonly guildId: string;
  readonly initial: {
    readonly mutedRoleId: string | null;
    readonly dmOnSanction: boolean;
  };
  readonly roles: readonly RoleOption[];
}

/**
 * Carte de config moderation. Deux champs :
 * - Rôle muet (select Discord) : assigné par `/mute` et `/tempmute`.
 *   Sans valeur, ces commandes refusent l'action en demandant de
 *   configurer ici.
 * - DM sur sanction (toggle) : envoie un message privé au membre
 *   sanctionné avec l'action et la raison. Échec silencieux si DMs
 *   fermés (la sanction s'applique quand même).
 *
 * Le formulaire est `dirty`-aware : le bouton Enregistrer ne devient
 * actif qu'après modification. Les erreurs de l'API sont affichées
 * en bandeau ; les issues Zod ne devraient pas survenir tant que la
 * validation côté client respecte le schéma (snowflake 17–20 chars).
 */
export function ModerationConfigForm({
  guildId,
  initial,
  roles,
}: ModerationConfigFormProps): ReactElement {
  const [mutedRoleId, setMutedRoleId] = useState(initial.mutedRoleId ?? '');
  const [dmOnSanction, setDmOnSanction] = useState(initial.dmOnSanction);
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(
    null,
  );

  const dirty =
    mutedRoleId !== (initial.mutedRoleId ?? '') || dmOnSanction !== initial.dmOnSanction;

  const onSave = (): void => {
    setFeedback(null);
    startTransition(async () => {
      const payload = {
        version: 1,
        mutedRoleId: mutedRoleId.length > 0 ? mutedRoleId : null,
        dmOnSanction,
      };
      const result = await saveModuleConfig(guildId, 'moderation', payload);
      if (result.ok) {
        setFeedback({ kind: 'success', message: 'Configuration enregistrée.' });
      } else {
        const detail = result.details?.[0];
        const msg = detail
          ? `${detail.path.join('.')}: ${detail.message}`
          : (result.message ?? `Erreur ${result.status ?? ''}`);
        setFeedback({ kind: 'error', message: msg });
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Configuration</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="space-y-1">
          <label
            htmlFor="moderation-muted-role"
            className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
          >
            Rôle muet
          </label>
          <Select
            id="moderation-muted-role"
            value={mutedRoleId}
            onChange={(e) => setMutedRoleId(e.target.value)}
            disabled={pending}
          >
            <option value="">— Aucun —</option>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                @{role.name}
              </option>
            ))}
          </Select>
          <p className="text-xs text-muted-foreground">
            Rôle assigné par <code>/mute</code> et <code>/tempmute</code>. Sans rôle configuré, ces
            commandes refusent l'action.
          </p>
        </div>

        <div className="flex items-start justify-between gap-3 border-t border-border pt-4">
          <div className="flex-1 space-y-0.5">
            <p className="font-medium text-foreground">DM sur sanction</p>
            <p className="text-xs text-muted-foreground">
              Envoyer un message privé au membre sanctionné avec la raison. Échec silencieux si DMs
              fermés.
            </p>
          </div>
          <Toggle
            checked={dmOnSanction}
            onCheckedChange={setDmOnSanction}
            disabled={pending}
            label={dmOnSanction ? 'Désactiver les DMs de sanction' : 'Activer les DMs de sanction'}
          />
        </div>

        {feedback !== null ? (
          <p
            role={feedback.kind === 'error' ? 'alert' : 'status'}
            className={
              feedback.kind === 'error'
                ? 'rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive'
                : 'rounded border border-success/40 bg-success/10 px-3 py-2 text-xs text-success'
            }
          >
            {feedback.message}
          </p>
        ) : null}

        <div className="flex justify-end pt-2">
          <Button type="button" disabled={!dirty || pending} onClick={onSave}>
            {pending ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
