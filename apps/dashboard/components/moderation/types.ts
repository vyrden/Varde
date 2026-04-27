/**
 * Types partagés côté client pour le module moderation. Extraits de
 * `ModerationConfigForm` pour pouvoir être réutilisés par les sous-
 * composants tab (`GeneralTab`, `AutomodTab`, etc.) et par le parser
 * server-side de la page (`page.tsx`).
 */

export type AiCategoryClient = 'toxicity' | 'harassment' | 'hate' | 'sexual' | 'self-harm' | 'spam';

export type AutomodActionClient = 'delete' | 'warn' | 'mute';

export type KeywordListLanguageClient = 'fr' | 'en' | 'all';

export type RestrictedChannelModeClient = 'commands' | 'images' | 'videos';

export interface RestrictedChannelClient {
  readonly channelId: string;
  readonly modes: ReadonlyArray<RestrictedChannelModeClient>;
}

export interface RuleBaseClient {
  readonly id: string;
  readonly label: string;
  readonly actions: ReadonlyArray<AutomodActionClient>;
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
    })
  | (RuleBaseClient & {
      readonly kind: 'invites';
      readonly allowOwnGuild: boolean;
    })
  | (RuleBaseClient & {
      readonly kind: 'links';
      readonly mode: 'block-all' | 'whitelist';
      readonly whitelist: readonly string[];
    })
  | (RuleBaseClient & {
      readonly kind: 'caps';
      readonly minLength: number;
      readonly ratio: number;
    })
  | (RuleBaseClient & { readonly kind: 'emojis'; readonly maxCount: number })
  | (RuleBaseClient & { readonly kind: 'spoilers'; readonly maxCount: number })
  | (RuleBaseClient & {
      readonly kind: 'mentions';
      readonly maxCount: number;
      readonly includeRoles: boolean;
    })
  | (RuleBaseClient & { readonly kind: 'zalgo'; readonly ratio: number })
  | (RuleBaseClient & {
      readonly kind: 'keyword-list';
      readonly language: KeywordListLanguageClient;
      readonly categories: readonly AiCategoryClient[];
      readonly customWords: readonly string[];
    });

export interface AutomodConfigClient {
  readonly rules: readonly AutomodRuleClient[];
  readonly bypassRoleIds: readonly string[];
}

export interface ModerationConfigInitial {
  readonly mutedRoleId: string | null;
  readonly dmOnSanction: boolean;
  readonly automod: AutomodConfigClient;
  readonly restrictedChannels: readonly RestrictedChannelClient[];
}

export interface RoleOption {
  readonly id: string;
  readonly name: string;
}

export interface ChannelOption {
  readonly id: string;
  readonly name: string;
}
