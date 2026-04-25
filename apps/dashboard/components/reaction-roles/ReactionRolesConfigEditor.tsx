'use client';

import { useState, useTransition } from 'react';

import { deleteReactionRole } from '../../lib/reaction-roles-actions';
import { ReactionRoleEditor } from './ReactionRoleEditor';
import { ReactionRolesList } from './ReactionRolesList';
import { TemplatePicker } from './TemplatePicker';
import type { ReactionRoleTemplate } from './templates';

export interface ReactionRoleMessageClient {
  readonly id: string;
  readonly label: string;
  readonly channelId: string;
  readonly messageId: string;
  readonly message: string;
  readonly mode: 'normal' | 'unique' | 'verifier';
  readonly feedback: 'dm' | 'none';
  readonly pairs: readonly {
    readonly emoji:
      | { type: 'unicode'; value: string }
      | { type: 'custom'; id: string; name: string; animated: boolean };
    readonly roleId: string;
  }[];
}

export interface ChannelOption {
  readonly id: string;
  readonly name: string;
}

export interface RoleOption {
  readonly id: string;
  readonly name: string;
}

export interface ReactionRolesConfigEditorProps {
  readonly guildId: string;
  readonly initialMessages: readonly ReactionRoleMessageClient[];
  readonly channels: readonly ChannelOption[];
  readonly roles: readonly RoleOption[];
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
    if (!confirm('Supprimer ce reaction-role ? Le message Discord restera.')) return;
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
      onSaved={(saved) => {
        setMessages(messages.map((m) => (m.id === saved.id ? saved : m)));
        setView({ kind: 'list' });
      }}
      onCancel={() => setView({ kind: 'list' })}
    />
  );
}
