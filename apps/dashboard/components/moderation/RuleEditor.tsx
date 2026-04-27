'use client';

import { Button, Input, Select, Toggle } from '@varde/ui';
import type { ReactElement } from 'react';

import { ActionsPicker } from './ActionsPicker';
import { KeywordListEditor } from './KeywordListEditor';
import { LinksEditor } from './LinksEditor';
import {
  AI_CATEGORY_LABEL,
  KIND_BADGE_CLASS,
  KIND_HINT,
  KIND_LABEL,
  msToSeconds,
  secondsToMs,
} from './rule-meta';
import type { AiCategoryClient, AutomodRuleClient } from './types';

export interface RuleEditorProps {
  readonly rule: AutomodRuleClient;
  readonly pending: boolean;
  readonly onChange: (next: AutomodRuleClient) => void;
  readonly onRemove: () => void;
}

/**
 * Éditeur d'une règle automod. Affiche un en-tête commun (badge kind +
 * hint + toggle enabled + suppression), puis le label + les actions
 * (multi-toggle) ; ensuite les paramètres spécifiques au kind via
 * sous-composants dédiés (LinksEditor, KeywordListEditor, etc.) ou
 * inline pour les kinds à 1-2 paramètres simples.
 *
 * Si la règle utilise l'action `mute`, un champ « durée du mute »
 * apparaît en bas (commun à tous les kinds).
 */
export function RuleEditor({ rule, pending, onChange, onRemove }: RuleEditorProps): ReactElement {
  return (
    <>
      <div className="mb-2 flex items-center gap-2">
        <span
          className={`inline-flex shrink-0 items-center rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${KIND_BADGE_CLASS[rule.kind]}`}
        >
          {KIND_LABEL[rule.kind]}
        </span>
        <span className="flex-1 truncate text-[11px] text-muted-foreground">
          {KIND_HINT[rule.kind]}
        </span>
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

      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label={`Libellé règle ${rule.label || '(nouvelle)'}`}
          value={rule.label}
          onChange={(e) => onChange({ ...rule, label: e.target.value })}
          placeholder="Libellé court (ex. mots-grossiers)"
          className="min-w-40 flex-1"
          disabled={pending}
        />
        <ActionsPicker
          actions={rule.actions}
          pending={pending}
          onChange={(next) => onChange({ ...rule, actions: next })}
        />
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

      {rule.kind === 'invites' ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Détecte <code>discord.gg/CODE</code>, <code>discord.com/invite/CODE</code> et leurs
          variantes. La whitelist du serveur courant n'est pas encore implémentée — toute invite
          détectée déclenche.
        </p>
      ) : null}

      {rule.kind === 'links' ? (
        <LinksEditor rule={rule} pending={pending} onChange={onChange} />
      ) : null}

      {rule.kind === 'caps' ? (
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <label
              htmlFor={`caps-min-${rule.id}`}
              className="block text-[11px] font-medium text-muted-foreground"
            >
              Longueur min (4-200)
            </label>
            <Input
              id={`caps-min-${rule.id}`}
              type="number"
              min={4}
              max={200}
              value={rule.minLength}
              onChange={(e) =>
                onChange({
                  ...rule,
                  minLength: Math.max(4, Math.min(200, Number(e.target.value) || 8)),
                })
              }
              disabled={pending}
            />
          </div>
          <div className="space-y-1">
            <label
              htmlFor={`caps-ratio-${rule.id}`}
              className="block text-[11px] font-medium text-muted-foreground"
            >
              Ratio uppercase (0.3-1.0)
            </label>
            <Input
              id={`caps-ratio-${rule.id}`}
              type="number"
              min={0.3}
              max={1}
              step={0.05}
              value={rule.ratio}
              onChange={(e) =>
                onChange({
                  ...rule,
                  ratio: Math.max(0.3, Math.min(1, Number(e.target.value) || 0.7)),
                })
              }
              disabled={pending}
            />
          </div>
        </div>
      ) : null}

      {rule.kind === 'emojis' ? (
        <div className="mt-2 max-w-xs space-y-1">
          <label
            htmlFor={`emo-${rule.id}`}
            className="block text-[11px] font-medium text-muted-foreground"
          >
            Emojis max (2-50)
          </label>
          <Input
            id={`emo-${rule.id}`}
            type="number"
            min={2}
            max={50}
            value={rule.maxCount}
            onChange={(e) =>
              onChange({
                ...rule,
                maxCount: Math.max(2, Math.min(50, Number(e.target.value) || 10)),
              })
            }
            disabled={pending}
          />
        </div>
      ) : null}

      {rule.kind === 'spoilers' ? (
        <div className="mt-2 max-w-xs space-y-1">
          <label
            htmlFor={`spo-${rule.id}`}
            className="block text-[11px] font-medium text-muted-foreground"
          >
            Spoilers max (2-20)
          </label>
          <Input
            id={`spo-${rule.id}`}
            type="number"
            min={2}
            max={20}
            value={rule.maxCount}
            onChange={(e) =>
              onChange({
                ...rule,
                maxCount: Math.max(2, Math.min(20, Number(e.target.value) || 5)),
              })
            }
            disabled={pending}
          />
        </div>
      ) : null}

      {rule.kind === 'mentions' ? (
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <label
              htmlFor={`men-${rule.id}`}
              className="block text-[11px] font-medium text-muted-foreground"
            >
              Mentions max (2-50)
            </label>
            <Input
              id={`men-${rule.id}`}
              type="number"
              min={2}
              max={50}
              value={rule.maxCount}
              onChange={(e) =>
                onChange({
                  ...rule,
                  maxCount: Math.max(2, Math.min(50, Number(e.target.value) || 5)),
                })
              }
              disabled={pending}
            />
          </div>
          <div className="flex items-end gap-2 pb-1">
            <Toggle
              checked={rule.includeRoles}
              onCheckedChange={(next) => onChange({ ...rule, includeRoles: next })}
              disabled={pending}
              label={`Inclure les mentions de rôles ${rule.includeRoles ? '(actif)' : '(inactif)'}`}
            />
            <span className="text-[11px] text-muted-foreground">Inclure les mentions de rôles</span>
          </div>
        </div>
      ) : null}

      {rule.kind === 'zalgo' ? (
        <div className="mt-2 max-w-xs space-y-1">
          <label
            htmlFor={`zal-${rule.id}`}
            className="block text-[11px] font-medium text-muted-foreground"
          >
            Ratio combining marks (0.1-1.0)
          </label>
          <Input
            id={`zal-${rule.id}`}
            type="number"
            min={0.1}
            max={1}
            step={0.05}
            value={rule.ratio}
            onChange={(e) =>
              onChange({
                ...rule,
                ratio: Math.max(0.1, Math.min(1, Number(e.target.value) || 0.3)),
              })
            }
            disabled={pending}
          />
        </div>
      ) : null}

      {rule.kind === 'keyword-list' ? (
        <KeywordListEditor rule={rule} pending={pending} onChange={onChange} />
      ) : null}

      {rule.actions.includes('mute') ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-info/5 px-3 py-2">
          <label
            htmlFor={`mute-duration-${rule.id}`}
            className="text-[11px] font-medium text-muted-foreground"
          >
            Durée du mute (sec, vide = indéfini)
          </label>
          <Input
            id={`mute-duration-${rule.id}`}
            type="number"
            min={1}
            max={86_400}
            value={rule.durationMs !== null ? msToSeconds(rule.durationMs) : ''}
            placeholder="indéfini"
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === '') {
                onChange({ ...rule, durationMs: null });
                return;
              }
              const seconds = Math.max(1, Math.min(86_400, Number(raw) || 1));
              onChange({ ...rule, durationMs: secondsToMs(seconds) });
            }}
            className="w-32 shrink-0"
            disabled={pending}
          />
        </div>
      ) : null}
    </>
  );
}
