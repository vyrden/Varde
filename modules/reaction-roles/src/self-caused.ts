/**
 * Tracker de "reactions causées par nous-mêmes".
 *
 * Quand le module appelle `ctx.discord.removeUserReaction(...)` pour
 * basculer un rôle en mode Unique, Discord émet ensuite un event
 * `messageReactionRemove` que nous recevons via la même EventBus.
 * Il faut ignorer cet event — sinon on retirerait à nouveau le rôle.
 *
 * Mécanique : avant chaque appel à `removeUserReaction`, on push la
 * clé {userId, messageId, emojiKey}. Au reçu d'un event remove, on
 * check la clé : présente → skip + consomme la marque. Sinon → traitement
 * normal.
 *
 * TTL de 2 secondes : si Discord n'émet pas l'event dans ce délai
 * (rarissime), on nettoie et on évite une fuite mémoire sur process
 * long-running.
 */

export interface SelfCausedTracker {
  readonly mark: (userId: string, messageId: string, emojiKey: string) => void;
  readonly isSelfCaused: (userId: string, messageId: string, emojiKey: string) => boolean;
  /** Taille actuelle (pour tests / debug). */
  readonly size: () => number;
}

const TTL_MS = 2000;

export function createSelfCausedTracker(nowProvider: () => number = Date.now): SelfCausedTracker {
  const marks = new Map<string, number>(); // key → expiresAt

  const key = (userId: string, messageId: string, emojiKey: string): string =>
    `${userId}::${messageId}::${emojiKey}`;

  const purgeExpired = (now: number): void => {
    for (const [k, expiresAt] of marks) {
      if (expiresAt <= now) marks.delete(k);
    }
  };

  return {
    mark(userId, messageId, emojiKey) {
      const now = nowProvider();
      purgeExpired(now);
      marks.set(key(userId, messageId, emojiKey), now + TTL_MS);
    },
    isSelfCaused(userId, messageId, emojiKey) {
      const now = nowProvider();
      purgeExpired(now);
      const k = key(userId, messageId, emojiKey);
      const present = marks.has(k);
      if (present) marks.delete(k);
      return present;
    },
    size() {
      return marks.size;
    },
  };
}

/** Formate un emoji en clé stable (unicode value ou custom id). */
export function emojiKey(
  emoji: { type: 'unicode'; value: string } | { type: 'custom'; id: string },
): string {
  return emoji.type === 'unicode' ? `u:${emoji.value}` : `c:${emoji.id}`;
}
