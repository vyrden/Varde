/**
 * Traduit une raison technique retournée par l'API (ou un échec réseau)
 * en message lisible pour l'admin. Accepte un `detail` optionnel
 * (typiquement la raison Discord d'une création de rôle échouée).
 */
export function formatReactionRoleReason(reason: string, detail?: string): string {
  switch (reason) {
    case 'service-indisponible':
      return 'Le bot Discord est indisponible. Réessaie dans quelques instants.';
    case 'body-invalide':
      return 'La requête est invalide. Vérifie les emojis et les rôles de chaque paire.';
    case 'role-creation-failed':
      return `Impossible de créer un rôle : ${formatDiscordReason(detail ?? 'unknown')}`;
    case 'channel-not-found':
      return 'Salon introuvable ou inaccessible par le bot.';
    case 'message-not-found':
      return "Le message Discord associé n'existe plus. Supprime l'entrée et recrée-la.";
    case 'emoji-not-found':
      return "Un emoji est introuvable. Vérifie qu'il s'agit d'un emoji Unicode ou d'un emoji du serveur.";
    case 'missing-permission':
      return 'Permissions Discord manquantes (Manage Roles, Send Messages, Add Reactions).';
    case 'rate-limit-exhausted':
      return 'Limite de débit Discord atteinte. Réessaie dans quelques secondes.';
    case 'network':
      return "Impossible de joindre l'API. Vérifie la connexion au serveur.";
    case 'unknown':
      return 'Erreur inattendue côté serveur. Consulte les logs.';
    default:
      if (reason.startsWith('http-')) {
        return `Erreur HTTP ${reason.slice(5)}.`;
      }
      return `Erreur : ${reason}`;
  }
}

function formatDiscordReason(reason: string): string {
  switch (reason) {
    case 'missing-permission':
      return 'permissions Discord manquantes.';
    case 'rate-limit-exhausted':
      return 'limite de débit atteinte.';
    case 'channel-not-found':
      return 'salon introuvable.';
    case 'message-not-found':
      return 'message introuvable.';
    case 'emoji-not-found':
      return 'emoji introuvable.';
    default:
      return 'erreur Discord inattendue.';
  }
}
