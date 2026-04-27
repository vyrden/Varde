import { resolve as resolvePath } from 'node:path';

import {
  type ActionId,
  type BotSettings,
  type ChannelId,
  type GuildId,
  type GuildMemberJoinEvent,
  type GuildMemberLeaveEvent,
  type ModuleContext,
  type RoleId,
  readBotSettings,
  type UserId,
} from '@varde/contracts';

import { renderWelcomeCard } from './card.js';
import { resolveConfig, type WelcomeConfig, type WelcomeMessageBlock } from './config.js';
import { renderTemplate, type TemplateVariables } from './template-render.js';

/**
 * Résout un `backgroundImagePath` (relatif, persisté en config) en
 * chemin absolu lisible par le renderer. Lit `VARDE_UPLOADS_DIR`
 * depuis l'environnement avec un fallback sur `./uploads` (cwd).
 *
 * V1 : le module est partie du monolith et a accès à process.env.
 * V2 : injecter un service uploads via ctx pour découpler.
 */
const resolveBackgroundAbsolute = (relativePath: string): string => {
  const uploadsDir = process.env['VARDE_UPLOADS_DIR'] ?? './uploads';
  return resolvePath(uploadsDir, relativePath);
};

const ACTION_WELCOMED = 'welcome.member.welcomed' as ActionId;
const ACTION_GOODBYE = 'welcome.member.goodbye' as ActionId;
const ACTION_AUTOROLE = 'welcome.member.autorole' as ActionId;
const ACTION_KICKED = 'welcome.member.kicked' as ActionId;
const ACTION_QUARANTINED = 'welcome.member.quarantined' as ActionId;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const computeAccountAgeDays = (createdAtMs: number, now: number): number =>
  Math.max(0, Math.floor((now - createdAtMs) / MS_PER_DAY));

/**
 * Charge en un seul appel le snapshot `guild_config` puis en dérive la
 * config welcome ET les paramètres globaux `core.bot-settings`. Évite
 * un double aller-retour DB et garantit que les deux vues sont cohérentes
 * (même version du snapshot).
 */
const safeLoadConfig = async (
  ctx: ModuleContext,
  guildId: GuildId,
): Promise<{ cfg: WelcomeConfig; botSettings: BotSettings } | null> => {
  try {
    const raw = await ctx.config.get(guildId);
    return { cfg: resolveConfig(raw), botSettings: readBotSettings(raw) };
  } catch (error) {
    ctx.logger.warn('welcome : impossible de résoudre la config', {
      guildId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
};

/** Rend une carte d'avatar, ou retourne null si la carte est désactivée. */
const buildCardAttachment = async (
  block: WelcomeMessageBlock,
  title: string,
  subtitle: string,
  avatarUrl: string,
  resolveBackgroundAbsolute?: (relativePath: string) => string,
): Promise<{ name: string; data: Buffer } | null> => {
  if (!block.card.enabled) return null;
  try {
    const backgroundImagePath =
      block.card.backgroundImagePath !== null && resolveBackgroundAbsolute !== undefined
        ? resolveBackgroundAbsolute(block.card.backgroundImagePath)
        : undefined;
    const data = await renderWelcomeCard({
      title,
      subtitle,
      avatarUrl,
      backgroundColor: block.card.backgroundColor,
      ...(backgroundImagePath !== undefined ? { backgroundImagePath } : {}),
      text: block.card.text,
    });
    return { name: 'welcome-card.png', data };
  } catch {
    return null;
  }
};

/**
 * Construit le payload `embeds` Discord à partir du bloc message.
 * Reste minimal : titre + couleur + image attachée (référencée via
 * `attachment://welcome-card.png`).
 *
 * `fallbackColorInt` est la couleur globale `core.bot-settings.embedColor`
 * de la guild — utilisée si le parse de `block.embed.color` rate, ce
 * qui ne devrait pas arriver en pratique (validé Zod côté config) mais
 * garantit que le fallback respecte les choix de l'admin plutôt que
 * de retomber sur un blurple hardcodé.
 */
const buildEmbeds = (
  block: WelcomeMessageBlock,
  description: string,
  hasCard: boolean,
  fallbackColorInt: number,
): unknown[] | undefined => {
  if (!block.embed.enabled) return undefined;
  const colorInt = Number.parseInt(block.embed.color.slice(1), 16);
  return [
    {
      description,
      color: Number.isFinite(colorInt) ? colorInt : fallbackColorInt,
      ...(hasCard ? { image: { url: 'attachment://welcome-card.png' } } : {}),
    },
  ];
};

/**
 * Programme l'attribution de l'auto-rôle (immédiate ou différée selon
 * `delaySeconds`). Chaque rôle est tenté indépendamment ; les échecs
 * sont loggés mais n'interrompent pas la chaîne.
 */
const scheduleAutorole = async (
  ctx: ModuleContext,
  guildId: GuildId,
  userId: UserId,
  cfg: WelcomeConfig['autorole'],
): Promise<void> => {
  if (!cfg.enabled || cfg.roleIds.length === 0) return;
  const apply = async (): Promise<void> => {
    for (const roleId of cfg.roleIds) {
      try {
        await ctx.discord.addMemberRole(guildId, userId, roleId as RoleId);
        void ctx.audit.log({
          guildId,
          action: ACTION_AUTOROLE,
          actor: { type: 'module', id: 'welcome' as never },
          severity: 'info',
          metadata: { userId, roleId, delaySeconds: cfg.delaySeconds },
        });
      } catch (error) {
        ctx.logger.warn('welcome : auto-rôle a échoué', {
          guildId,
          userId,
          roleId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  };
  if (cfg.delaySeconds === 0) {
    await apply();
    return;
  }
  const jobKey = `welcome.autorole.${guildId}.${userId}`;
  await ctx.scheduler.in(cfg.delaySeconds * 1000, jobKey, apply);
};

/** Vérifie le filtre comptes neufs. Retourne `true` si l'event a été traité (kick/quarantine). */
const applyAccountAgeFilter = async (
  ctx: ModuleContext,
  guildId: GuildId,
  userId: UserId,
  accountAgeDays: number,
  cfg: WelcomeConfig['accountAgeFilter'],
): Promise<boolean> => {
  if (!cfg.enabled || cfg.minDays === 0) return false;
  if (accountAgeDays >= cfg.minDays) return false;

  if (cfg.action === 'kick') {
    try {
      await ctx.discord.kickMember(guildId, userId, `Compte trop neuf (< ${cfg.minDays}j)`);
      void ctx.audit.log({
        guildId,
        action: ACTION_KICKED,
        actor: { type: 'module', id: 'welcome' as never },
        severity: 'warn',
        metadata: { userId, accountAgeDays, minDays: cfg.minDays },
      });
    } catch (error) {
      ctx.logger.warn('welcome : kick comptes neufs a échoué', {
        guildId,
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return true;
  }

  // quarantine : assigne le rôle et n'applique pas l'auto-rôle normal.
  if (cfg.quarantineRoleId === null) {
    ctx.logger.error('welcome : quarantineRoleId manquant alors que filtre actif');
    return false;
  }
  try {
    await ctx.discord.addMemberRole(guildId, userId, cfg.quarantineRoleId as RoleId);
    void ctx.audit.log({
      guildId,
      action: ACTION_QUARANTINED,
      actor: { type: 'module', id: 'welcome' as never },
      severity: 'warn',
      metadata: {
        userId,
        roleId: cfg.quarantineRoleId,
        accountAgeDays,
        minDays: cfg.minDays,
      },
    });
  } catch (error) {
    ctx.logger.warn('welcome : quarantine a échoué', {
      guildId,
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return true;
};

/**
 * Envoie le message d'accueil/départ selon la destination configurée.
 * Pour `goodbye`, l'argument destination est ignoré (toujours channel).
 */
const sendWelcomeMessage = async (
  ctx: ModuleContext,
  block: WelcomeMessageBlock,
  destination: 'channel' | 'dm' | 'both',
  userId: UserId,
  content: string,
  files: ReadonlyArray<{ name: string; data: Buffer }>,
  embeds: unknown[] | undefined,
): Promise<void> => {
  const fileOpts =
    files.length > 0 || embeds !== undefined
      ? {
          ...(files.length > 0 ? { files } : {}),
          ...(embeds !== undefined ? { embeds } : {}),
        }
      : undefined;

  if (destination !== 'dm' && block.channelId !== null) {
    try {
      await ctx.discord.postMessage(block.channelId as ChannelId, content, fileOpts);
    } catch (error) {
      ctx.logger.warn('welcome : postMessage a échoué', {
        channelId: block.channelId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (destination !== 'channel') {
    try {
      await ctx.discord.sendDirectMessage(userId, content, fileOpts);
    } catch (error) {
      ctx.logger.debug('welcome : sendDirectMessage a échoué', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
};

export async function handleMemberJoin(
  ctx: ModuleContext,
  event: GuildMemberJoinEvent,
): Promise<void> {
  ctx.logger.debug('welcome : memberJoin reçu', {
    guildId: event.guildId,
    userId: event.userId,
  });

  const loaded = await safeLoadConfig(ctx, event.guildId);
  if (loaded === null) return;
  const { cfg, botSettings } = loaded;

  const typedGuildId = event.guildId as GuildId;
  const typedUserId = event.userId as UserId;

  const userInfo = await ctx.discord.getUserDisplayInfo(typedUserId);
  const accountAgeDays =
    userInfo !== null ? computeAccountAgeDays(userInfo.accountCreatedAt, Date.now()) : 0;

  // 1) Filtre comptes neufs (court-circuite welcome + autorole si actif).
  const filtered = await applyAccountAgeFilter(
    ctx,
    typedGuildId,
    typedUserId,
    accountAgeDays,
    cfg.accountAgeFilter,
  );
  if (filtered) return;

  // 2) Auto-rôle (immédiat ou différé).
  await scheduleAutorole(ctx, typedGuildId, typedUserId, cfg.autorole);

  // 3) Message d'accueil.
  if (!cfg.welcome.enabled) return;
  if (cfg.welcome.destination !== 'dm' && cfg.welcome.channelId === null) {
    ctx.logger.debug('welcome : welcome.enabled mais channelId null, on saute');
    return;
  }

  const guildName = ctx.discord.getGuildName(typedGuildId) ?? event.guildId;
  const memberCount = ctx.discord.getMemberCount(typedGuildId) ?? 0;
  const username = userInfo?.username ?? event.userId;
  const tag = userInfo?.tag ?? username;

  const vars: TemplateVariables = {
    user: username,
    userMention: `<@${event.userId}>`,
    userTag: tag,
    guild: guildName,
    memberCount,
    accountAgeDays,
  };
  const content = renderTemplate(cfg.welcome.message, vars);

  const card = await buildCardAttachment(
    cfg.welcome,
    `Bienvenue, ${tag} !`,
    `Tu es le ${memberCount}ᵉ membre`,
    userInfo?.avatarUrl ?? '',
    resolveBackgroundAbsolute,
  );
  const files = card !== null ? [card] : [];
  const embeds = buildEmbeds(cfg.welcome, content, card !== null, botSettings.embedColorInt);

  await sendWelcomeMessage(
    ctx,
    cfg.welcome,
    cfg.welcome.destination,
    typedUserId,
    embeds !== undefined ? '' : content,
    files,
    embeds,
  );

  void ctx.audit.log({
    guildId: typedGuildId,
    action: ACTION_WELCOMED,
    actor: { type: 'module', id: 'welcome' as never },
    severity: 'info',
    metadata: { userId: event.userId, destination: cfg.welcome.destination },
  });
}

export async function handleMemberLeave(
  ctx: ModuleContext,
  event: GuildMemberLeaveEvent,
): Promise<void> {
  ctx.logger.debug('welcome : memberLeave reçu', {
    guildId: event.guildId,
    userId: event.userId,
  });

  const loaded = await safeLoadConfig(ctx, event.guildId);
  if (loaded === null) return;
  const { cfg, botSettings } = loaded;
  if (!cfg.goodbye.enabled || cfg.goodbye.channelId === null) return;

  const typedGuildId = event.guildId as GuildId;
  const typedUserId = event.userId as UserId;

  const userInfo = await ctx.discord.getUserDisplayInfo(typedUserId);
  const guildName = ctx.discord.getGuildName(typedGuildId) ?? event.guildId;
  const memberCount = ctx.discord.getMemberCount(typedGuildId) ?? 0;
  const username = userInfo?.username ?? event.userId;
  const tag = userInfo?.tag ?? username;

  const vars: TemplateVariables = {
    user: username,
    userMention: `<@${event.userId}>`,
    userTag: tag,
    guild: guildName,
    memberCount,
  };
  const content = renderTemplate(cfg.goodbye.message, vars);

  const card = await buildCardAttachment(
    cfg.goodbye,
    `Au revoir, ${tag}`,
    `${memberCount} membre${memberCount > 1 ? 's' : ''} restant${memberCount > 1 ? 's' : ''}`,
    userInfo?.avatarUrl ?? '',
    resolveBackgroundAbsolute,
  );
  const files = card !== null ? [card] : [];
  const embeds = buildEmbeds(cfg.goodbye, content, card !== null, botSettings.embedColorInt);
  const fileOpts =
    files.length > 0 || embeds !== undefined
      ? {
          ...(files.length > 0 ? { files } : {}),
          ...(embeds !== undefined ? { embeds } : {}),
        }
      : undefined;

  try {
    await ctx.discord.postMessage(
      cfg.goodbye.channelId as ChannelId,
      embeds !== undefined ? '' : content,
      fileOpts,
    );
  } catch (error) {
    ctx.logger.warn('welcome : goodbye postMessage a échoué', {
      channelId: cfg.goodbye.channelId,
      error: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  void ctx.audit.log({
    guildId: typedGuildId,
    action: ACTION_GOODBYE,
    actor: { type: 'module', id: 'welcome' as never },
    severity: 'info',
    metadata: { userId: event.userId, channelId: cfg.goodbye.channelId },
  });
}
