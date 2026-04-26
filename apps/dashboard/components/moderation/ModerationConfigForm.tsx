'use client';

import { Button, Card, CardContent, CardHeader, CardTitle, Input, Select, Toggle } from '@varde/ui';
import { type ReactElement, useState, useTransition } from 'react';

import { saveModuleConfig } from '../../lib/actions';

interface RoleOption {
  readonly id: string;
  readonly name: string;
}

export type AiCategoryClient = 'toxicity' | 'harassment' | 'hate' | 'sexual' | 'self-harm' | 'spam';

interface RuleBaseClient {
  readonly id: string;
  readonly label: string;
  readonly action: 'delete' | 'warn' | 'mute';
  readonly durationMs: number | null;
  readonly enabled: boolean;
}

export type AutomodRuleClient =
  | (RuleBaseClient & { readonly kind: 'blacklist'; readonly pattern: string })
  | (RuleBaseClient & { readonly kind: 'regex'; readonly pattern: string })
  | (RuleBaseClient & {
      readonly kind: 'rate-limit';
      readonly count: number;
      readonly windowMs: number;
      readonly scope: 'user-guild' | 'user-channel';
    })
  | (RuleBaseClient & {
      readonly kind: 'ai-classify';
      readonly categories: readonly AiCategoryClient[];
      readonly maxContentLength: number;
    });

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

const blankBlacklist = (): AutomodRuleClient => ({
  id: newRuleId(),
  label: '',
  kind: 'blacklist',
  pattern: '',
  action: 'delete',
  durationMs: null,
  enabled: true,
});

const blankRegex = (): AutomodRuleClient => ({
  id: newRuleId(),
  label: '',
  kind: 'regex',
  pattern: '',
  action: 'delete',
  durationMs: null,
  enabled: true,
});

const blankRateLimit = (): AutomodRuleClient => ({
  id: newRuleId(),
  label: '',
  kind: 'rate-limit',
  count: 5,
  windowMs: 10_000,
  scope: 'user-guild',
  action: 'mute',
  durationMs: 600_000,
  enabled: true,
});

const blankAiClassify = (): AutomodRuleClient => ({
  id: newRuleId(),
  label: '',
  kind: 'ai-classify',
  categories: ['toxicity'],
  maxContentLength: 500,
  action: 'delete',
  durationMs: null,
  enabled: true,
});

const KIND_LABEL: Record<AutomodRuleClient['kind'], string> = {
  blacklist: 'Blacklist',
  regex: 'Regex',
  'rate-limit': 'Rate-limit',
  'ai-classify': 'IA',
};

const KIND_BADGE_CLASS: Record<AutomodRuleClient['kind'], string> = {
  blacklist: 'bg-muted text-foreground',
  regex: 'bg-muted text-foreground',
  'rate-limit': 'bg-warning/20 text-foreground',
  'ai-classify': 'bg-primary/20 text-primary',
};

/** Sous-titre court affiché à côté du badge kind dans l'éditeur de règle. */
const KIND_HINT: Record<AutomodRuleClient['kind'], string> = {
  blacklist: 'Substring case-insensitive — mot ou phrase à bloquer',
  regex: 'Expression régulière (flag i) — pattern textuel avancé',
  'rate-limit': 'Sliding window — déclenche au-delà de N messages',
  'ai-classify': 'Classification IA — catégories surveillées par le modèle',
};

/** Code couleur de l'action, repris des tokens Discord (palette automod). */
const ACTION_DOT: Record<'delete' | 'warn' | 'mute', string> = {
  delete: 'bg-destructive',
  warn: 'bg-warning',
  mute: 'bg-info',
};

const AI_CATEGORY_LABEL: Record<AiCategoryClient, string> = {
  toxicity: 'Toxicité',
  harassment: 'Harcèlement',
  hate: 'Discours haineux',
  sexual: 'Sexuel',
  'self-harm': 'Auto-mutilation',
  spam: 'Spam',
};

/**
 * Convertit une valeur en secondes (entrée admin) vers ms pour le
 * stockage. Tronque au plus proche entier de seconde, plancher 1s.
 */
const secondsToMs = (s: number): number => Math.max(1, Math.round(s)) * 1000;
const msToSeconds = (ms: number): number => Math.round(ms / 1000);

/**
 * Carte de config moderation. Trois sections :
 * - Rôle muet + DM sur sanction (réglages globaux).
 * - Automod : règles évaluées sur chaque message non-bot.
 *   Quatre kinds : blacklist (substring), regex, rate-limit (sliding
 *   window), ai-classify (catégorisation IA). Les règles synchrones
 *   passent en premier ; l'IA n'est appelée qu'en fallback.
 * - Rôles bypass : exclus de l'évaluation.
 *
 * Le formulaire est `dirty`-aware : Enregistrer ne devient actif
 * qu'après modification.
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

  const isRuleComplete = (r: AutomodRuleClient): boolean => {
    if (r.label.length === 0) return false;
    if (r.kind === 'blacklist' || r.kind === 'regex') return r.pattern.length > 0;
    if (r.kind === 'rate-limit') return r.count >= 2 && r.windowMs >= 1_000;
    return r.categories.length > 0;
  };

  const onSave = (): void => {
    setFeedback(null);
    startTransition(async () => {
      const payload = {
        version: 1,
        mutedRoleId: mutedRoleId.length > 0 ? mutedRoleId : null,
        dmOnSanction,
        automod: {
          rules: rules.filter(isRuleComplete),
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

  const updateRule = <T extends AutomodRuleClient>(id: string, next: T): void => {
    setRules((prev) => prev.map((r) => (r.id === id ? next : r)));
  };
  const removeRule = (id: string): void => {
    setRules((prev) => prev.filter((r) => r.id !== id));
  };
  const addRule = (factory: () => AutomodRuleClient): void => {
    setRules((prev) => [...prev, factory()]);
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
                Règles évaluées sur chaque message non-bot. Les règles synchrones (blacklist / regex
                / rate-limit) passent en premier ; la classification IA n'est appelée que si aucune
                ne matche.
              </p>
            </div>
          </div>

          {rules.length === 0 ? (
            <div className="rounded-md border border-dashed border-border bg-muted/20 px-4 py-6 text-center">
              <p className="text-xs text-muted-foreground">
                Aucune règle. Ajoute une blacklist (mots interdits), une regex (pattern avancé), un
                rate-limit (anti-flood) ou une règle IA (classification).
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {rules.map((rule) => (
                <li
                  key={rule.id}
                  className="rounded-lg border border-border bg-card/60 px-3.5 py-3 shadow-sm"
                >
                  <RuleEditor
                    rule={rule}
                    pending={pending}
                    onChange={(next) => updateRule(rule.id, next)}
                    onRemove={() => removeRule(rule.id)}
                  />
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => addRule(blankBlacklist)}
              disabled={pending}
            >
              + Blacklist
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => addRule(blankRegex)}
              disabled={pending}
            >
              + Regex
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => addRule(blankRateLimit)}
              disabled={pending}
            >
              + Rate-limit
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => addRule(blankAiClassify)}
              disabled={pending}
            >
              + IA
            </Button>
          </div>

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

interface RuleEditorProps {
  readonly rule: AutomodRuleClient;
  readonly pending: boolean;
  readonly onChange: (next: AutomodRuleClient) => void;
  readonly onRemove: () => void;
}

function RuleEditor({ rule, pending, onChange, onRemove }: RuleEditorProps): ReactElement {
  return (
    <>
      <div className="flex flex-wrap items-start gap-2">
        <div className="flex min-w-40 flex-1 flex-col gap-1">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex shrink-0 items-center rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${KIND_BADGE_CLASS[rule.kind]}`}
            >
              {KIND_LABEL[rule.kind]}
            </span>
            <span className="text-[11px] text-muted-foreground">{KIND_HINT[rule.kind]}</span>
          </div>
          <Input
            aria-label={`Libellé règle ${rule.label || '(nouvelle)'}`}
            value={rule.label}
            onChange={(e) => onChange({ ...rule, label: e.target.value })}
            placeholder="Libellé court (ex. mots-grossiers)"
            disabled={pending}
          />
        </div>

        <div className="flex items-center gap-2 self-stretch">
          <div className="relative">
            <span
              aria-hidden="true"
              className={`pointer-events-none absolute top-1/2 left-2.5 size-2 -translate-y-1/2 rounded-full ${ACTION_DOT[rule.action]}`}
            />
            <Select
              aria-label="Action"
              value={rule.action}
              onChange={(e) =>
                onChange({ ...rule, action: e.target.value as 'delete' | 'warn' | 'mute' })
              }
              wrapperClassName="w-32"
              disabled={pending}
              className="pl-7"
            >
              <option value="delete">Delete</option>
              <option value="warn">Warn</option>
              <option value="mute">Mute</option>
            </Select>
          </div>
          <Toggle
            checked={rule.enabled}
            onCheckedChange={(next) => onChange({ ...rule, enabled: next })}
            disabled={pending}
            label={rule.enabled ? `Désactiver ${rule.label}` : `Activer ${rule.label}`}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onRemove}
            disabled={pending}
            aria-label={`Supprimer ${rule.label || 'la règle'}`}
            className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            ✕
          </Button>
        </div>
      </div>

      {rule.kind === 'blacklist' || rule.kind === 'regex' ? (
        <Input
          aria-label="Pattern"
          value={rule.pattern}
          onChange={(e) => onChange({ ...rule, pattern: e.target.value })}
          placeholder={
            rule.kind === 'blacklist'
              ? 'Mot ou phrase (case-insensitive)'
              : 'Regex (ex. (https?:\\/\\/[^ ]+\\s+){3,})'
          }
          className="mt-2 font-mono text-xs"
          disabled={pending}
        />
      ) : null}

      {rule.kind === 'rate-limit' ? (
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="space-y-1">
            <label
              htmlFor={`rl-count-${rule.id}`}
              className="block text-[11px] font-medium text-muted-foreground"
            >
              Messages max (2-50)
            </label>
            <Input
              id={`rl-count-${rule.id}`}
              type="number"
              min={2}
              max={50}
              value={rule.count}
              onChange={(e) =>
                onChange({
                  ...rule,
                  count: Math.max(2, Math.min(50, Number(e.target.value) || 2)),
                })
              }
              disabled={pending}
            />
          </div>
          <div className="space-y-1">
            <label
              htmlFor={`rl-window-${rule.id}`}
              className="block text-[11px] font-medium text-muted-foreground"
            >
              Fenêtre (sec)
            </label>
            <Input
              id={`rl-window-${rule.id}`}
              type="number"
              min={1}
              max={600}
              value={msToSeconds(rule.windowMs)}
              onChange={(e) =>
                onChange({
                  ...rule,
                  windowMs: secondsToMs(Math.max(1, Math.min(600, Number(e.target.value) || 1))),
                })
              }
              disabled={pending}
            />
          </div>
          <div className="space-y-1">
            <label
              htmlFor={`rl-scope-${rule.id}`}
              className="block text-[11px] font-medium text-muted-foreground"
            >
              Scope
            </label>
            <Select
              id={`rl-scope-${rule.id}`}
              value={rule.scope}
              onChange={(e) =>
                onChange({ ...rule, scope: e.target.value as 'user-guild' | 'user-channel' })
              }
              disabled={pending}
            >
              <option value="user-guild">Par membre / serveur</option>
              <option value="user-channel">Par membre / salon</option>
            </Select>
          </div>
        </div>
      ) : null}

      {rule.kind === 'ai-classify' ? (
        <div className="mt-2 space-y-2">
          <p className="text-[11px] font-medium text-muted-foreground">
            Catégories surveillées (au moins une)
          </p>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(AI_CATEGORY_LABEL) as AiCategoryClient[]).map((cat) => {
              const active = rule.categories.includes(cat);
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() =>
                    onChange({
                      ...rule,
                      categories: active
                        ? rule.categories.filter((c) => c !== cat)
                        : [...rule.categories, cat],
                    })
                  }
                  disabled={pending}
                  className={`rounded-md px-2 py-1 text-xs transition-colors ${
                    active
                      ? 'bg-primary/15 text-primary'
                      : 'bg-surface-active text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {AI_CATEGORY_LABEL[cat]}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Le bot envoie chaque message non-bot au classifier IA configuré (cf. Paramètres →
            Fournisseur IA). Si la réponse correspond à l'une des catégories cochées, l'action est
            appliquée. Coût IA payé seulement si aucune règle synchrone n'a déjà matché.
          </p>
        </div>
      ) : null}
    </>
  );
}
