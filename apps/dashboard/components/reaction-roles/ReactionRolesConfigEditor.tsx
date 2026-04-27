'use client';

import { type ReactElement, type ReactNode, useState, useTransition } from 'react';

import { deleteReactionRole } from '../../lib/reaction-roles-actions';
import { ReactionRoleEditor } from './ReactionRoleEditor';
import { ReactionRolesList } from './ReactionRolesList';
import { TemplatePicker } from './TemplatePicker';
import type { ReactionRoleTemplate } from './templates';
import type { ChannelOption, EmojiCatalog, ReactionRoleMessageClient, RoleOption } from './types';

// Re-exports back-compat (page.tsx + tests externes importaient ces
// types depuis ce fichier avant la refonte single-page).
export type {
  ChannelOption,
  CustomEmojiOption,
  EmojiCatalog,
  ReactionRoleButtonStyleClient,
  ReactionRoleMessageClient,
  ReactionRolePairClient,
  ReactionRolePairKindClient,
  RoleOption,
} from './types';

export interface ReactionRolesConfigEditorProps {
  readonly guildId: string;
  readonly initialMessages: readonly ReactionRoleMessageClient[];
  readonly channels: readonly ChannelOption[];
  readonly roles: readonly RoleOption[];
  readonly emojis: EmojiCatalog;
  /** Card "Statut du module" injectée par la page (server-rendered). */
  readonly statusCard: ReactNode;
}

type View =
  | { kind: 'list' }
  | { kind: 'picker' }
  | { kind: 'editor-new'; template: ReactionRoleTemplate }
  | { kind: 'editor-edit'; messageId: string };

/**
 * Racine cliente du module reaction-roles. Machine d'états à 3
 * écrans : liste → picker de template → éditeur. Le `statusCard`
 * passe à la landing uniquement (pas affiché en éditeur — focus sur
 * la tâche d'édition).
 */
export function ReactionRolesConfigEditor(
  props: ReactionRolesConfigEditorProps,
): ReactElement | null {
  const [messages, setMessages] = useState<readonly ReactionRoleMessageClient[]>(
    props.initialMessages,
  );
  const [view, setView] = useState<View>({ kind: 'list' });
  const [, startTransition] = useTransition();

  const channelNameById = Object.fromEntries(props.channels.map((c) => [c.id, c.name]));

  const handleDelete = (id: string): void => {
    const target = messages.find((m) => m.id === id);
    if (!target) return;
    startTransition(async () => {
      const result = await deleteReactionRole(props.guildId, target.messageId);
      if (result.ok) {
        setMessages(messages.filter((m) => m.id !== id));
      }
    });
  };

  if (view.kind === 'list') {
    return (
      <ReactionRolesList
        messages={messages}
        channelNameById={channelNameById}
        roles={props.roles}
        emojis={props.emojis}
        onAddNew={() => setView({ kind: 'picker' })}
        onEdit={(id) => setView({ kind: 'editor-edit', messageId: id })}
        onDelete={handleDelete}
        statusCard={props.statusCard}
      />
    );
  }

  if (view.kind === 'picker') {
    return (
      <TemplatePicker
        onPick={(template) => setView({ kind: 'editor-new', template })}
        onCancel={() => setView({ kind: 'list' })}
      />
    );
  }

  if (view.kind === 'editor-new') {
    return (
      <ReactionRoleEditor
        mode="new"
        guildId={props.guildId}
        template={view.template}
        channels={props.channels}
        roles={props.roles}
        emojis={props.emojis}
        onSaved={(saved) => {
          setMessages([...messages, saved]);
          setView({ kind: 'list' });
        }}
        onCancel={() => setView({ kind: 'list' })}
      />
    );
  }

  const current = messages.find((m) => m.id === view.messageId);
  if (!current) {
    setView({ kind: 'list' });
    return null;
  }
  return (
    <ReactionRoleEditor
      mode="edit"
      guildId={props.guildId}
      existing={current}
      channels={props.channels}
      roles={props.roles}
      emojis={props.emojis}
      onSaved={(saved) => {
        setMessages(messages.map((m) => (m.id === saved.id ? saved : m)));
        setView({ kind: 'list' });
      }}
      onCancel={() => setView({ kind: 'list' })}
    />
  );
}
