'use client';

import { useRef } from 'react';

import type { WelcomeConfigClient } from '../../lib/welcome-actions';
import { BackgroundImageInput } from './BackgroundImageInput';
import { TEMPLATE_VARIABLES_CLIENT } from './templates';

type Block = WelcomeConfigClient['welcome'] | WelcomeConfigClient['goodbye'];

interface ChannelOption {
  readonly id: string;
  readonly name: string;
}

export interface MessageBlockEditorProps<B extends Block> {
  readonly title: string;
  readonly block: B;
  readonly onChange: (next: B) => void;
  readonly channels: readonly ChannelOption[];
  /** Mode `welcome` autorise destination=channel|dm|both. `goodbye` est channel-only. */
  readonly variant: 'welcome' | 'goodbye';
  /** Requis pour brancher l'upload d'image de fond sur l'API. */
  readonly guildId: string;
}

const colorPresets = ['#5865F2', '#7C3AED', '#0EA5E9', '#10B981', '#F59E0B', '#EF4444', '#64748B'];
const cardPresets = ['#2C2F33', '#1F2937', '#7C3AED', '#1E1B4B', '#0F172A', '#831843'];

/**
 * Bloc d'édition réutilisable pour les sections welcome et goodbye.
 * `variant` contrôle la présence du sélecteur de destination
 * (channel/DM/both) — goodbye est toujours channel-only.
 */
export function MessageBlockEditor<B extends Block>({
  title,
  block,
  onChange,
  channels,
  variant,
  guildId,
}: MessageBlockEditorProps<B>) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const insertVariable = (key: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const before = ta.value.slice(0, ta.selectionStart);
    const after = ta.value.slice(ta.selectionEnd);
    const next = `${before}{${key}}${after}`;
    onChange({ ...block, message: next } as B);
    requestAnimationFrame(() => {
      const pos = before.length + key.length + 2;
      ta.setSelectionRange(pos, pos);
      ta.focus();
    });
  };

  const updateBlock = <K extends keyof B>(key: K, value: B[K]) =>
    onChange({ ...block, [key]: value });

  const isWelcome = variant === 'welcome';
  const welcomeBlock = block as WelcomeConfigClient['welcome'];

  // Section activée mais incomplète (config invalide, save échouera).
  const channelRequired = isWelcome ? welcomeBlock.destination !== 'dm' : true;
  const missingChannel = block.enabled && channelRequired && block.channelId === null;

  return (
    <fieldset className="space-y-4 rounded-lg border border-border bg-muted/30 p-4">
      <legend className="px-2 text-sm font-semibold">{title}</legend>

      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={block.enabled}
          onChange={(e) => updateBlock('enabled', e.target.checked as B[keyof B])}
        />
        Activer
      </label>

      {missingChannel ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          Section activée mais aucun salon sélectionné. Choisis un salon ci-dessous, sinon décoche «
          Activer » — sans ça la sauvegarde sera refusée.
        </p>
      ) : null}

      {block.enabled ? (
        <>
          {isWelcome ? (
            <div className="space-y-1">
              <p className="text-sm font-medium">Destination</p>
              <div className="flex gap-2">
                {(
                  [
                    { value: 'channel', label: 'Salon' },
                    { value: 'dm', label: 'DM' },
                    { value: 'both', label: 'Les deux' },
                  ] as const
                ).map((d) => (
                  <label
                    key={d.value}
                    className={`flex-1 cursor-pointer rounded-md border p-2 text-center text-sm ${
                      welcomeBlock.destination === d.value
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-muted-foreground'
                    }`}
                  >
                    <input
                      type="radio"
                      name={`destination-${title}`}
                      value={d.value}
                      checked={welcomeBlock.destination === d.value}
                      onChange={() =>
                        onChange({
                          ...(block as WelcomeConfigClient['welcome']),
                          destination: d.value,
                        } as B)
                      }
                      className="sr-only"
                    />
                    {d.label}
                  </label>
                ))}
              </div>
            </div>
          ) : null}

          {!isWelcome || welcomeBlock.destination !== 'dm' ? (
            <div className="space-y-1">
              <label className="block text-sm font-medium" htmlFor={`channel-${title}`}>
                Salon
              </label>
              <select
                id={`channel-${title}`}
                value={block.channelId ?? ''}
                onChange={(e) =>
                  updateBlock(
                    'channelId',
                    (e.target.value === '' ? null : e.target.value) as B[keyof B],
                  )
                }
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">— choisir un salon —</option>
                {channels.map((c) => (
                  <option key={c.id} value={c.id}>
                    #{c.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium" htmlFor={`msg-${title}`}>
                Message
              </label>
              <div className="flex flex-wrap gap-1">
                {TEMPLATE_VARIABLES_CLIENT.map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    onClick={() => insertVariable(v.key)}
                    title={v.description}
                    className="rounded bg-muted px-2 py-0.5 text-xs hover:bg-muted-foreground/20"
                  >
                    {`{${v.key}}`}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              id={`msg-${title}`}
              ref={textareaRef}
              value={block.message}
              placeholder={
                isWelcome
                  ? 'Bienvenue {user.mention} sur {guild} !'
                  : '{user.tag} a quitté le serveur.'
              }
              maxLength={2000}
              rows={3}
              onChange={(e) => updateBlock('message', e.target.value as B[keyof B])}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <p className="text-xs text-muted-foreground">{block.message.length}/2000</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={block.embed.enabled}
                  onChange={(e) =>
                    updateBlock('embed', {
                      ...block.embed,
                      enabled: e.target.checked,
                    } as B[keyof B])
                  }
                />
                Embed coloré
              </label>
              {block.embed.enabled ? (
                <div className="flex flex-wrap gap-1">
                  {colorPresets.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() =>
                        updateBlock('embed', { ...block.embed, color: c } as B[keyof B])
                      }
                      title={c}
                      className={`h-6 w-6 rounded border-2 ${
                        block.embed.color === c ? 'border-foreground' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                  <input
                    type="color"
                    value={block.embed.color}
                    onChange={(e) =>
                      updateBlock('embed', { ...block.embed, color: e.target.value } as B[keyof B])
                    }
                    className="h-6 w-8"
                  />
                </div>
              ) : null}
            </div>

            <div className="space-y-2">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={block.card.enabled}
                  onChange={(e) =>
                    updateBlock('card', {
                      ...block.card,
                      enabled: e.target.checked,
                    } as B[keyof B])
                  }
                />
                Carte d'avatar
              </label>
              {block.card.enabled ? (
                <>
                  <div className="flex flex-wrap gap-1">
                    {cardPresets.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() =>
                          updateBlock('card', {
                            ...block.card,
                            backgroundColor: c,
                          } as B[keyof B])
                        }
                        title={c}
                        className={`h-6 w-6 rounded border-2 ${
                          block.card.backgroundColor === c
                            ? 'border-foreground'
                            : 'border-transparent'
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                    <input
                      type="color"
                      value={block.card.backgroundColor}
                      onChange={(e) =>
                        updateBlock('card', {
                          ...block.card,
                          backgroundColor: e.target.value,
                        } as B[keyof B])
                      }
                      className="h-6 w-8"
                    />
                  </div>
                  <BackgroundImageInput
                    guildId={guildId}
                    target={variant}
                    currentPath={block.card.backgroundImagePath}
                    onChange={(relativePath) =>
                      updateBlock('card', {
                        ...block.card,
                        backgroundImagePath: relativePath,
                      } as B[keyof B])
                    }
                  />
                </>
              ) : null}
            </div>
          </div>
        </>
      ) : null}
    </fieldset>
  );
}
