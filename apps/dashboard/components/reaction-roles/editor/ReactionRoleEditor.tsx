'use client';

import {
  Button,
  DiscordMessagePreview,
  type DiscordPreviewAttachment,
  type DiscordPreviewButton,
  type DiscordPreviewReaction,
  StickyActionBar,
} from '@varde/ui';
import { type ReactElement, useMemo, useState, useTransition } from 'react';

import { useDirtyExitGuard } from '../../../lib/hooks/useDirtyExitGuard';
import {
  type PublishReactionRoleInput,
  type PublishReactionRolePairInput,
  publishReactionRole,
  syncReactionRole,
} from '../../../lib/reaction-roles-actions';
import { formatReactionRoleReason } from '../../../lib/reaction-roles-reasons';
import type { ReactionRoleTemplate } from '../templates';
import type { ChannelOption, EmojiCatalog, ReactionRoleMessageClient, RoleOption } from '../types';
import { BehaviorSection } from './BehaviorSection';
import { ElementsSection } from './ElementsSection';
import {
  buildClientPair,
  evaluateEditorValidity,
  pairsFromExisting,
  pairsFromTemplate,
  parseEmoji,
} from './editor-helpers';
import type { EditorFeedback, EditorMode, FeedbackState, PairDraft } from './editor-types';
import { GeneralInfoSection } from './GeneralInfoSection';

/**
 * Convertit un texte d'emoji brut (saisi côté admin) en glyph
 * affichable dans le preview Discord. Les emojis custom (`<:n:id>`)
 * sont rendus sous forme `:n:` faute d'avoir leur image vraie côté
 * client.
 */
const renderEmojiForPreview = (raw: string): string => {
  if (raw.trim().length === 0) return '·';
  if (raw.startsWith('<')) return `:${raw.replace(/^<a?:([^:]+):.*$/, '$1')}:`;
  return raw;
};

/** Choisit le label du bouton pour le preview : custom > rôle existant > nom du rôle à créer > fallback. */
const buttonLabelForPreview = (p: PairDraft, rolesById: ReadonlyMap<string, string>): string => {
  if (p.label.trim().length > 0) return p.label;
  if (p.roleMode === 'existing' && p.roleId.length > 0) {
    return rolesById.get(p.roleId) ?? 'rôle';
  }
  if (p.roleMode === 'create' && p.roleName.trim().length > 0) return p.roleName;
  return 'rôle';
};

export type ReactionRoleEditorProps =
  | {
      readonly mode: 'new';
      readonly guildId: string;
      readonly template: ReactionRoleTemplate;
      readonly channels: readonly ChannelOption[];
      readonly roles: readonly RoleOption[];
      readonly emojis: EmojiCatalog;
      readonly onSaved: (newRR: ReactionRoleMessageClient) => void;
      readonly onCancel: () => void;
    }
  | {
      readonly mode: 'edit';
      readonly guildId: string;
      readonly existing: ReactionRoleMessageClient;
      readonly channels: readonly ChannelOption[];
      readonly roles: readonly RoleOption[];
      readonly emojis: EmojiCatalog;
      readonly onSaved: (updated: ReactionRoleMessageClient) => void;
      readonly onCancel: () => void;
    };

/**
 * Shell éditeur reaction-role en single-page builder. Layout deux
 * colonnes desktop (60% form / 40% preview sticky) ; mobile passe en
 * 1 colonne avec preview en haut puis form (le contenu visuel prime
 * sur mobile).
 *
 * State :
 * - `label`, `channelId`, `message`, `mode`, `feedbackChoice`,
 *   `pairs` — édités via les sections.
 * - Snapshot initial JSON pour détection dirty + Cancel restore.
 *
 * Validation :
 * - `evaluateEditorValidity` centralise la règle (label + channel +
 *   message + ≥1 paire valide + cohérence ephemeral/bouton).
 * - Sticky bar : Save désactivé si !valid, avec tooltip explicite.
 *
 * Sortie sécurisée :
 * - `useDirtyExitGuard` pose un listener `beforeunload` quand dirty.
 * - Bouton "← Retour" passe par `confirmIfDirty` avant `onCancel`.
 *
 * Save flow :
 * - Mode `new` → `publishReactionRole` (save + post Discord).
 * - Mode `edit` → `syncReactionRole` (save + sync Discord).
 * - Pas de séparation brouillon/publié pour V1 (cf. proposition
 *   architecture — extension API à venir).
 */
export function ReactionRoleEditor(props: ReactionRoleEditorProps): ReactElement {
  const isNew = props.mode === 'new';

  // ─── State édité ─────────────────────────────────────────────────
  const [label, setLabel] = useState<string>(
    isNew ? props.template.defaultLabel : props.existing.label,
  );
  const [channelId, setChannelId] = useState<string>(isNew ? '' : props.existing.channelId);
  const [message, setMessage] = useState<string>(
    isNew ? props.template.defaultMessage : props.existing.message,
  );
  const [editorMode, setEditorMode] = useState<EditorMode>(
    isNew ? props.template.defaultMode : props.existing.mode,
  );
  const [feedbackChoice, setFeedbackChoice] = useState<EditorFeedback>(
    isNew ? 'dm' : props.existing.feedback,
  );
  const [pairs, setPairs] = useState<PairDraft[]>(
    isNew ? pairsFromTemplate(props.template) : pairsFromExisting(props.existing),
  );
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [pending, startTransition] = useTransition();

  const validity = evaluateEditorValidity({
    label,
    channelId,
    message,
    pairs,
    feedbackChoice,
  });

  // ─── Snapshot initial pour Cancel + dirty ────────────────────────
  // Snapshot figé au mount : on ne veut pas qu'il se mette à jour si
  // les props changent (sinon le `dirty` serait perpétuellement faux
  // après une révision externe). Les dépendances sont volontairement
  // omises — le calcul ne se relance jamais.
  // biome-ignore lint/correctness/useExhaustiveDependencies: snapshot capturé au mount uniquement
  const initialSnapshot = useMemo(
    () =>
      JSON.stringify({
        label: isNew ? props.template.defaultLabel : props.existing.label,
        channelId: isNew ? '' : props.existing.channelId,
        message: isNew ? props.template.defaultMessage : props.existing.message,
        editorMode: isNew ? props.template.defaultMode : props.existing.mode,
        feedbackChoice: isNew ? 'dm' : props.existing.feedback,
        pairs: isNew ? pairsFromTemplate(props.template) : pairsFromExisting(props.existing),
      }),
    [],
  );

  const currentSnapshot = JSON.stringify({
    label,
    channelId,
    message,
    editorMode,
    feedbackChoice,
    pairs,
  });

  const dirty = currentSnapshot !== initialSnapshot;

  const exitGuard = useDirtyExitGuard(dirty);

  const onResetToInitial = (): void => {
    const parsed = JSON.parse(initialSnapshot) as {
      label: string;
      channelId: string;
      message: string;
      editorMode: EditorMode;
      feedbackChoice: EditorFeedback;
      pairs: PairDraft[];
    };
    setLabel(parsed.label);
    setChannelId(parsed.channelId);
    setMessage(parsed.message);
    setEditorMode(parsed.editorMode);
    setFeedbackChoice(parsed.feedbackChoice);
    setPairs(parsed.pairs);
    setFeedback(null);
  };

  const onBackClick = (): void => {
    exitGuard.confirmIfDirty(() => props.onCancel());
  };

  // ─── Save ────────────────────────────────────────────────────────
  const buildApiPairs = (): PublishReactionRoleInput['pairs'] => {
    return pairs.map((p) => {
      const emoji = parseEmoji(p.emoji);
      if (!emoji) throw new Error(`Emoji invalide : "${p.emoji}"`);
      const base: PublishReactionRolePairInput = {
        kind: p.kind,
        emoji,
        ...(p.kind === 'button' ? { label: p.label, style: p.style } : {}),
      };
      if (p.roleMode === 'existing') {
        return { ...base, roleId: p.roleId };
      }
      return { ...base, roleName: p.roleName };
    });
  };

  const handleSubmit = (): void => {
    if (!validity.isValid) return;
    setFeedback(null);
    startTransition(async () => {
      if (props.mode === 'new') {
        const apiPairs = buildApiPairs();
        const result = await publishReactionRole(props.guildId, {
          label: label.trim(),
          channelId,
          message: message.trim(),
          mode: editorMode,
          feedback: feedbackChoice,
          pairs: apiPairs,
        });
        if (!result.ok) {
          setFeedback({
            kind: 'error',
            message: formatReactionRoleReason(result.reason, result.detail),
          });
          return;
        }
        props.onSaved({
          id: result.id,
          label: label.trim(),
          channelId,
          messageId: result.messageId,
          message: message.trim(),
          mode: editorMode,
          feedback: feedbackChoice,
          pairs: pairs.map(buildClientPair),
        });
      } else {
        const apiPairs = buildApiPairs();
        const result = await syncReactionRole(props.guildId, props.existing.messageId, {
          label: label.trim(),
          channelId,
          message: message.trim(),
          mode: editorMode,
          feedback: feedbackChoice,
          pairs: apiPairs,
        });
        if (!result.ok) {
          setFeedback({
            kind: 'error',
            message: formatReactionRoleReason(result.reason),
          });
          return;
        }
        props.onSaved({
          ...props.existing,
          label: label.trim(),
          channelId,
          messageId: result.messageId ?? props.existing.messageId,
          message: message.trim(),
          mode: editorMode,
          feedback: feedbackChoice,
          pairs: pairs.map(buildClientPair),
        });
      }
    });
  };

  // ─── Preview attachments depuis les paires ───────────────────────
  // Calcul à chaque render — les paires sont peu nombreuses (max 20)
  // et le `useMemo` apporte plus de bruit (deps des helpers locaux)
  // que de gain de perf ici.
  const rolesById = new Map(props.roles.map((r) => [r.id, r.name]));

  const previewAttachments: ReadonlyArray<DiscordPreviewAttachment> = pairs.map((p) => {
    if (p.kind === 'button') {
      const button: DiscordPreviewButton = {
        kind: 'button',
        label: buttonLabelForPreview(p, rolesById),
        style: p.style,
        ...(p.emoji.trim().length > 0 ? { emoji: renderEmojiForPreview(p.emoji) } : {}),
      };
      return button;
    }
    const reaction: DiscordPreviewReaction = {
      kind: 'reaction',
      emoji: renderEmojiForPreview(p.emoji),
    };
    return reaction;
  });

  // ─── Sticky bar ──────────────────────────────────────────────────
  const saveDisabled = !validity.isValid;
  const saveDisabledTitle = !validity.isValid
    ? 'Remplis label, salon, contenu, et au moins un élément valide.'
    : undefined;

  const barDescription =
    feedback?.kind === 'error' ? (
      <span className="text-destructive">{feedback.message}</span>
    ) : undefined;

  const title = isNew ? 'Créer un reaction-role' : `Éditer « ${props.existing.label} »`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Button type="button" variant="ghost" size="sm" onClick={onBackClick}>
          ← Retour
        </Button>
        <span aria-hidden="true" className="h-4 w-px bg-border" />
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex flex-col gap-4 min-w-0">
          <GeneralInfoSection
            label={label}
            onLabelChange={setLabel}
            channelId={channelId}
            onChannelChange={setChannelId}
            message={message}
            onMessageChange={setMessage}
            channels={props.channels}
            pending={pending}
            {...(!isNew ? { originalChannelId: props.existing.channelId } : {})}
          />

          <BehaviorSection
            mode={editorMode}
            onModeChange={setEditorMode}
            feedbackChoice={feedbackChoice}
            onFeedbackChange={setFeedbackChoice}
            hasButton={validity.hasButton}
            pending={pending}
          />

          <ElementsSection
            pairs={pairs}
            onPairsChange={(next) => setPairs([...next])}
            roles={props.roles}
            emojis={props.emojis}
            pending={pending}
          />
        </div>

        <aside className="md:sticky md:top-20 md:self-start">
          <DiscordMessagePreview
            botName="Varde Bot"
            content={message}
            attachments={previewAttachments}
            emptyPlaceholder="Ajoute des réactions ou des boutons pour les voir apparaître ici."
            footnote="Aperçu indicatif — le rendu final peut varier selon Discord (couleurs custom, emojis animés…)."
          />
        </aside>
      </div>

      <StickyActionBar
        dirty={dirty}
        pending={pending}
        onCancel={() => exitGuard.confirmIfDirty(onResetToInitial)}
        onSave={handleSubmit}
        description={barDescription}
        saveDisabled={saveDisabled}
        {...(saveDisabledTitle !== undefined ? { saveDisabledTitle } : {})}
        cancelLabel="Annuler les modifs"
        saveLabel={isNew ? 'Publier' : 'Enregistrer'}
        pendingLabel={isNew ? 'Publication…' : 'Enregistrement…'}
      />
    </div>
  );
}
