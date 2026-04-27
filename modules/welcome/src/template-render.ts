/**
 * Variables exposées aux templates de message welcome/goodbye.
 *
 * - `user` : nom d'affichage (display name si dispo, sinon username sans
 *   discriminator).
 * - `user.mention` : mention cliquable `<@id>` dans le salon.
 * - `user.tag` : forme `Username#0001` ou `Username` (pseudo Discord
 *   moderne sans discriminator).
 * - `guild` : nom du serveur.
 * - `memberCount` : nombre de membres après l'event.
 * - `accountAge` : âge du compte en jours, formatté (« 3 jours », « 2 mois »,
 *   « 1 an »). Pour goodbye, peut être omis.
 */
export interface TemplateVariables {
  readonly user: string;
  readonly userMention: string;
  readonly userTag: string;
  readonly guild: string;
  readonly memberCount: number;
  readonly accountAgeDays?: number;
}

const formatAccountAge = (days: number): string => {
  if (days < 1) return "moins d'un jour";
  if (days < 30) return `${days} jour${days > 1 ? 's' : ''}`;
  if (days < 365) {
    const months = Math.floor(days / 30);
    return `${months} mois`;
  }
  const years = Math.floor(days / 365);
  return `${years} an${years > 1 ? 's' : ''}`;
};

/**
 * Substitue les `{var}` du template par leurs valeurs. Variables
 * inconnues ou indéfinies → laissées telles quelles dans le texte
 * pour rendre l'erreur visible (fail loud côté admin).
 */
export function renderTemplate(template: string, vars: TemplateVariables): string {
  const replacements: Record<string, string> = {
    user: vars.user,
    'user.mention': vars.userMention,
    'user.tag': vars.userTag,
    guild: vars.guild,
    memberCount: String(vars.memberCount),
    ...(vars.accountAgeDays !== undefined
      ? { accountAge: formatAccountAge(vars.accountAgeDays) }
      : {}),
  };
  return template.replace(/\{([a-zA-Z][a-zA-Z0-9.]*)\}/g, (_, key: string) => {
    return key in replacements ? (replacements[key] ?? `{${key}}`) : `{${key}}`;
  });
}

/** Liste des variables disponibles, pour l'aide / l'auto-complétion dashboard. */
export const TEMPLATE_VARIABLES = [
  { key: 'user', description: "Nom d'affichage du membre" },
  { key: 'user.mention', description: 'Mention cliquable du membre (<@id>)' },
  { key: 'user.tag', description: 'Pseudo complet du membre' },
  { key: 'guild', description: 'Nom du serveur' },
  { key: 'memberCount', description: 'Nombre total de membres' },
  { key: 'accountAge', description: 'Âge du compte Discord (welcome uniquement)' },
] as const;
