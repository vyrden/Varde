export const locales = {
  fr: {
    'count.self': 'Tu as envoyé **{count}** message(s) sur ce serveur.',
    'count.other': '<@{userId}> a envoyé **{count}** message(s) sur ce serveur.',
    'count.zero.self': "Tu n'as pas encore envoyé de message comptabilisé sur ce serveur.",
    'count.zero.other': "<@{userId}> n'a pas encore envoyé de message comptabilisé sur ce serveur.",
  },
  en: {
    'count.self': 'You have sent **{count}** message(s) in this server.',
    'count.other': '<@{userId}> has sent **{count}** message(s) in this server.',
    'count.zero.self': 'You have not sent any counted message in this server yet.',
    'count.zero.other': '<@{userId}> has not sent any counted message in this server yet.',
  },
} as const;
