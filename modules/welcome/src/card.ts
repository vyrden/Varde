import { readFile } from 'node:fs/promises';

import { createCanvas, loadImage } from '@napi-rs/canvas';

/**
 * Génère une carte d'accueil PNG (700×250) façon « welcome card » :
 * avatar circulaire à gauche, titre et sous-titre à droite. Le fond
 * est soit une couleur unie (`backgroundColor`), soit une image
 * personnalisée (`backgroundImageBytes`) couvrant la carte avec un
 * voile sombre superposé pour la lisibilité du texte.
 *
 * En cas d'échec de chargement de l'avatar (CDN HS, timeout réseau),
 * la carte est rendue avec un placeholder grisé pour ne pas bloquer
 * l'envoi du message de bienvenue. Idem pour l'image de fond — fallback
 * silencieux sur la couleur unie.
 */
export interface RenderCardOptions {
  readonly title: string;
  readonly subtitle: string;
  readonly avatarUrl: string;
  readonly backgroundColor: string;
  /**
   * Chemin absolu vers une image de fond (PNG/JPG/WEBP). Si fourni,
   * remplace `backgroundColor` (qui sert alors de fallback en cas
   * d'erreur de lecture).
   */
  readonly backgroundImagePath?: string;
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

/**
 * Dessine l'image de fond couvrant la carte (cover-fit) puis applique
 * un voile sombre semi-transparent pour que le texte blanc reste
 * lisible quel que soit l'arrière-plan. Renvoie `false` si le
 * chargement a échoué — l'appelant doit retomber sur la couleur unie.
 */
const drawImageBackground = async (
  ctx: ReturnType<ReturnType<typeof createCanvas>['getContext']>,
  imagePath: string,
): Promise<boolean> => {
  let bytes: Buffer;
  try {
    bytes = await readFile(imagePath);
  } catch {
    return false;
  }
  let img: Awaited<ReturnType<typeof loadImage>>;
  try {
    img = await loadImage(bytes);
  } catch {
    return false;
  }
  const imgW = img.width || CARD_WIDTH;
  const imgH = img.height || CARD_HEIGHT;
  // Cover-fit : on conserve le ratio, on remplit, on rogne au centre.
  const scale = Math.max(CARD_WIDTH / imgW, CARD_HEIGHT / imgH);
  const drawW = imgW * scale;
  const drawH = imgH * scale;
  const dx = (CARD_WIDTH - drawW) / 2;
  const dy = (CARD_HEIGHT - drawH) / 2;
  ctx.drawImage(img, dx, dy, drawW, drawH);

  // Voile sombre pour lisibilité du texte.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  return true;
};

export async function renderWelcomeCard(opts: RenderCardOptions): Promise<Buffer> {
  const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
  const ctx = canvas.getContext('2d');

  // Fond : image personnalisée si fournie et lisible, sinon couleur unie.
  let imageDrawn = false;
  if (opts.backgroundImagePath !== undefined && opts.backgroundImagePath !== '') {
    imageDrawn = await drawImageBackground(ctx, opts.backgroundImagePath);
  }
  if (!imageDrawn) {
    ctx.fillStyle = opts.backgroundColor;
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  }

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
