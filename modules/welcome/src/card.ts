import { createCanvas, loadImage } from '@napi-rs/canvas';

/**
 * Génère une carte d'accueil PNG (700×250) façon « welcome card » :
 * fond coloré, avatar circulaire à gauche, titre et sous-titre à droite.
 *
 * En cas d'échec de chargement de l'avatar (CDN HS, timeout réseau),
 * la carte est rendue avec un placeholder grisé pour ne pas bloquer
 * l'envoi du message de bienvenue.
 */
export interface RenderCardOptions {
  readonly title: string;
  readonly subtitle: string;
  readonly avatarUrl: string;
  readonly backgroundColor: string;
}

const CARD_WIDTH = 700;
const CARD_HEIGHT = 250;
const AVATAR_SIZE = 150;
const AVATAR_X = 50;
const AVATAR_Y = (CARD_HEIGHT - AVATAR_SIZE) / 2;
const TEXT_X = AVATAR_X + AVATAR_SIZE + 30;
const TEXT_TITLE_Y = 100;
const TEXT_SUBTITLE_Y = 150;

/** Tronque un texte avec ellipsis pour qu'il rentre dans `maxWidth`. */
const fitText = (
  ctx: ReturnType<ReturnType<typeof createCanvas>['getContext']>,
  raw: string,
  maxWidth: number,
): string => {
  if (ctx.measureText(raw).width <= maxWidth) return raw;
  let lo = 0;
  let hi = raw.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const candidate = `${raw.slice(0, mid)}…`;
    if (ctx.measureText(candidate).width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return `${raw.slice(0, lo)}…`;
};

export async function renderWelcomeCard(opts: RenderCardOptions): Promise<Buffer> {
  const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
  const ctx = canvas.getContext('2d');

  // Fond.
  ctx.fillStyle = opts.backgroundColor;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Avatar circulaire (clip + draw + bordure).
  ctx.save();
  ctx.beginPath();
  ctx.arc(AVATAR_X + AVATAR_SIZE / 2, AVATAR_Y + AVATAR_SIZE / 2, AVATAR_SIZE / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  let avatarLoaded = false;
  if (opts.avatarUrl !== '') {
    try {
      const img = await loadImage(opts.avatarUrl);
      ctx.drawImage(img, AVATAR_X, AVATAR_Y, AVATAR_SIZE, AVATAR_SIZE);
      avatarLoaded = true;
    } catch {
      /* placeholder gris ci-dessous */
    }
  }
  if (!avatarLoaded) {
    ctx.fillStyle = '#4F545C';
    ctx.fillRect(AVATAR_X, AVATAR_Y, AVATAR_SIZE, AVATAR_SIZE);
  }
  ctx.restore();

  // Bordure blanche autour de l'avatar.
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(AVATAR_X + AVATAR_SIZE / 2, AVATAR_Y + AVATAR_SIZE / 2, AVATAR_SIZE / 2, 0, Math.PI * 2);
  ctx.stroke();

  // Texte.
  const textMaxWidth = CARD_WIDTH - TEXT_X - 30;

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 32px sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(fitText(ctx, opts.title, textMaxWidth), TEXT_X, TEXT_TITLE_Y);

  ctx.fillStyle = '#B9BBBE';
  ctx.font = '20px sans-serif';
  ctx.fillText(fitText(ctx, opts.subtitle, textMaxWidth), TEXT_X, TEXT_SUBTITLE_Y);

  return canvas.toBuffer('image/png');
}
