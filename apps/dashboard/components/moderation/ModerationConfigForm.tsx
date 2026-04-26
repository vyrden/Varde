'use client';

import { Button, Card, CardContent, CardHeader, CardTitle, Input, Select, Toggle } from '@varde/ui';
import { type ReactElement, useState, useTransition } from 'react';

import { saveModuleConfig } from '../../lib/actions';

interface RoleOption {
  readonly id: string;
  readonly name: string;
}

export interface AutomodRuleClient {
  readonly id: string;
  readonly label: string;
  readonly kind: 'blacklist' | 'regex';
  readonly pattern: string;
  readonly action: 'delete' | 'warn' | 'mute';
  readonly durationMs: number | null;
  readonly enabled: boolean;
}

export interface AutomodConfigClient {
  readonly rules: readonly AutomodRuleClient[];
  readonly bypassRoleIds: readonly string[];
}

export interface ModerationConfigFormProps {
  readonly guildId: string;
  readonly initial: {
    readonly mutedRoleId: string | null;
    readonly dmOnSanction: boolean;
    readonly automod: AutomodConfigClient;
  };
  readonly roles: readonly RoleOption[];
}

const newRuleId = (): string =>
  `rule-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const blankRule = (): AutomodRuleClient => ({
  id: newRuleId(),
  label: '',
  kind: 'blacklist',
  pattern: '',
  action: 'delete',
  durationMs: null,
  enabled: true,
});

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
  const [rules, setRules] = useState<readonly AutomodRuleClient[]>(initial.automod.rules);
  const [bypassRoleIds, setBypassRoleIds] = useState<readonly string[]>(
    initial.automod.bypassRoleIds,
  );
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(
    null,
  );

  const dirty =
    mutedRoleId !== (initial.mutedRoleId ?? '') ||
    dmOnSanction !== initial.dmOnSanction ||
    JSON.stringify(rules) !== JSON.stringify(initial.automod.rules) ||
    JSON.stringify(bypassRoleIds) !== JSON.stringify(initial.automod.bypassRoleIds);

  const onSave = (): void => {
    setFeedback(null);
    startTransition(async () => {
      const payload = {
        version: 1,
        mutedRoleId: mutedRoleId.length > 0 ? mutedRoleId : null,
        dmOnSanction,
        automod: {
          rules: rules.filter((r) => r.label.length > 0 && r.pattern.length > 0),
          bypassRoleIds,
        },
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

  const updateRule = (id: string, patch: Partial<AutomodRuleClient>): void => {
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };
  const removeRule = (id: string): void => {
    setRules((prev) => prev.filter((r) => r.id !== id));
  };
  const addRule = (): void => {
    setRules((prev) => [...prev, blankRule()]);
  };

  const toggleBypass = (roleId: string): void => {
    setBypassRoleIds((prev) =>
      prev.includes(roleId) ? prev.filter((id) => id !== roleId) : [...prev, roleId],
    );
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

        <div className="space-y-3 border-t border-border pt-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 space-y-0.5">
              <p className="font-medium text-foreground">Automod</p>
              <p className="text-xs text-muted-foreground">
                Règles évaluées sur chaque message non-bot. La première règle qui matche pose son
                action. Les rôles bypass ne sont jamais évalués.
              </p>
            </div>
          </div>

          {rules.length === 0 ? (
            <p className="text-xs italic text-muted-foreground">Aucune règle.</p>
          ) : (
            <ul className="space-y-2">
              {rules.map((rule) => (
                <li
                  key={rule.id}
                  className="rounded-md border border-border bg-sidebar px-3 py-2.5"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      aria-label={`Libellé règle ${rule.label || '(nouvelle)'}`}
                      value={rule.label}
                      onChange={(e) => updateRule(rule.id, { label: e.target.value })}
                      placeholder="Libellé (ex. mots-grossiers)"
                      className="min-w-40 flex-1"
                      disabled={pending}
                    />
                    <Select
                      aria-label="Type de règle"
                      value={rule.kind}
                      onChange={(e) =>
                        updateRule(rule.id, { kind: e.target.value as 'blacklist' | 'regex' })
                      }
                      wrapperClassName="w-32"
                      disabled={pending}
                    >
                      <option value="blacklist">Blacklist</option>
                      <option value="regex">Regex</option>
                    </Select>
                    <Select
                      aria-label="Action"
                      value={rule.action}
                      onChange={(e) =>
                        updateRule(rule.id, {
                          action: e.target.value as 'delete' | 'warn' | 'mute',
                        })
                      }
                      wrapperClassName="w-28"
                      disabled={pending}
                    >
                      <option value="delete">Delete</option>
                      <option value="warn">Warn</option>
                      <option value="mute">Mute</option>
                    </Select>
                    <Toggle
                      checked={rule.enabled}
                      onCheckedChange={(next) => updateRule(rule.id, { enabled: next })}
                      disabled={pending}
                      label={rule.enabled ? `Désactiver ${rule.label}` : `Activer ${rule.label}`}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeRule(rule.id)}
                      disabled={pending}
                      aria-label={`Supprimer ${rule.label}`}
                    >
                      ✕
                    </Button>
                  </div>
                  <Input
                    aria-label="Pattern"
                    value={rule.pattern}
                    onChange={(e) => updateRule(rule.id, { pattern: e.target.value })}
                    placeholder={
                      rule.kind === 'blacklist'
                        ? 'Mot ou phrase (case-insensitive)'
                        : 'Regex (ex. (https?:\\/\\/[^ ]+\\s+){3,})'
                    }
                    className="mt-2 font-mono text-xs"
                    disabled={pending}
                  />
                </li>
              ))}
            </ul>
          )}

          <Button type="button" variant="outline" size="sm" onClick={addRule} disabled={pending}>
            + Ajouter une règle
          </Button>

          {roles.length > 0 ? (
            <div className="space-y-1 pt-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Rôles bypass
              </p>
              <p className="text-xs text-muted-foreground">
                Les membres ayant l'un de ces rôles ne sont pas évalués (mods, etc.).
              </p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {roles.map((role) => {
                  const active = bypassRoleIds.includes(role.id);
                  return (
                    <button
                      key={role.id}
                      type="button"
                      onClick={() => toggleBypass(role.id)}
                      disabled={pending}
                      className={`rounded-md px-2 py-1 text-xs transition-colors ${
                        active
                          ? 'bg-primary/15 text-primary'
                          : 'bg-surface-active text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      @{role.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
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
