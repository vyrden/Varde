'use client';

import { useState, useTransition } from 'react';

import { deleteReactionRole } from '../../lib/reaction-roles-actions';
import { ReactionRoleEditor } from './ReactionRoleEditor';
import { ReactionRolesList } from './ReactionRolesList';
import { TemplatePicker } from './TemplatePicker';
import type { ReactionRoleTemplate } from './templates';

export type ReactionRolePairKindClient = 'reaction' | 'button';
export type ReactionRoleButtonStyleClient = 'primary' | 'secondary' | 'success' | 'danger';

export interface ReactionRolePairClient {
  /** Type de l'élément (réaction emoji ou bouton Discord). */
  readonly kind: ReactionRolePairKindClient;
  readonly emoji:
    | { type: 'unicode'; value: string }
    | { type: 'custom'; id: string; name: string; animated: boolean };
  readonly roleId: string;
  /** Texte du bouton (kind=button uniquement). */
  readonly label: string;
  /** Couleur du bouton (kind=button uniquement). */
  readonly style: ReactionRoleButtonStyleClient;
}

export interface ReactionRoleMessageClient {
  readonly id: string;
  readonly label: string;
  readonly channelId: string;
  readonly messageId: string;
  readonly message: string;
  readonly mode: 'normal' | 'unique' | 'verifier';
  readonly feedback: 'dm' | 'ephemeral' | 'none';
  readonly pairs: readonly ReactionRolePairClient[];
}

export interface ChannelOption {
  readonly id: string;
  readonly name: string;
}

export interface RoleOption {
  readonly id: string;
  readonly name: string;
}

export interface CustomEmojiOption {
  readonly id: string;
  readonly name: string;
  readonly animated: boolean;
  /** Présent uniquement pour les emojis externes (autres serveurs). */
  readonly guildName?: string;
}

export interface EmojiCatalog {
  readonly current: readonly CustomEmojiOption[];
  readonly external: readonly CustomEmojiOption[];
}

export interface ReactionRolesConfigEditorProps {
  readonly guildId: string;
  readonly initialMessages: readonly ReactionRoleMessageClient[];
  readonly channels: readonly ChannelOption[];
  readonly roles: readonly RoleOption[];
  readonly emojis: EmojiCatalog;
  /** Version du module — affichée dans la sidebar « À propos ». */
  readonly moduleVersion: string;
  /** État d'activation du module — affiché dans la sidebar « À propos ». */
  readonly isEnabled: boolean;
}

type View =
  | { kind: 'list' }
  | { kind: 'picker' }
  | { kind: 'editor-new'; template: ReactionRoleTemplate }
  | { kind: 'editor-edit'; messageId: string };

/**
 * Racine cliente du module reaction-roles. Implémente une machine d'états
 * à 3 écrans : liste → picker de template → éditeur.
 */
export function ReactionRolesConfigEditor(props: ReactionRolesConfigEditorProps) {
  const [messages, setMessages] = useState<readonly ReactionRoleMessageClient[]>(
    props.initialMessages,
  );
  const [view, setView] = useState<View>({ kind: 'list' });
  const [, startTransition] = useTransition();

  const channelNameById = Object.fromEntries(props.channels.map((c) => [c.id, c.name]));

  const handleDelete = (id: string) => {
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
        guildId={props.guildId}
        messages={messages}
        channelNameById={channelNameById}
        version={props.moduleVersion}
        isEnabled={props.isEnabled}
        onAddNew={() => setView({ kind: 'picker' })}
        onEdit={(id) => setView({ kind: 'editor-edit', messageId: id })}
        onDelete={handleDelete}
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
