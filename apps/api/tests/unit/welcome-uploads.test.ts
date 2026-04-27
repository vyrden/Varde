import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createWelcomeUploadsService, WelcomeUploadError } from '../../src/welcome-uploads.js';

/**
 * Tests unitaires de `WelcomeUploadsService`. Couvre le décodage
 * des dataURL, la validation des magic bytes (jalon 5 PR 5.6 —
 * empêche un Content-Type falsifié de faire passer un binaire
 * arbitraire), les limites de taille et les chemins d'écriture.
 */

const GUILD = '111111111111111111';

// Magic bytes corrects pour les 3 formats acceptés.
const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_HEADER = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);
const WEBP_HEADER = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);

const dataUrlOf = (mime: string, bytes: Buffer): string =>
  `data:${mime};base64,${bytes.toString('base64')}`;

describe('WelcomeUploadsService', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'varde-welcome-uploads-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  describe('save — magic bytes valides', () => {
    it('accepte un PNG avec la bonne signature', async () => {
      const svc = createWelcomeUploadsService(dir);
      const result = await svc.save(GUILD, 'welcome', dataUrlOf('image/png', PNG_HEADER));
      expect(result.relativePath).toMatch(/welcome-bg\.png$/);
      const written = await readFile(result.absolutePath);
      expect(written.equals(PNG_HEADER)).toBe(true);
    });

    it('accepte un JPEG avec la bonne signature', async () => {
      const svc = createWelcomeUploadsService(dir);
      const result = await svc.save(GUILD, 'goodbye', dataUrlOf('image/jpeg', JPEG_HEADER));
      expect(result.relativePath).toMatch(/goodbye-bg\.jpg$/);
    });

    it('accepte un WebP avec la bonne signature RIFF/WEBP', async () => {
      const svc = createWelcomeUploadsService(dir);
      const result = await svc.save(GUILD, 'welcome', dataUrlOf('image/webp', WEBP_HEADER));
      expect(result.relativePath).toMatch(/welcome-bg\.webp$/);
    });
  });

  describe('save — magic bytes invalides (sécurité)', () => {
    it('refuse un payload HTML annoncé en image/png', async () => {
      const svc = createWelcomeUploadsService(dir);
      const html = Buffer.from('<html><script>alert(1)</script></html>');
      await expect(svc.save(GUILD, 'welcome', dataUrlOf('image/png', html))).rejects.toMatchObject({
        reason: 'invalid-image-content',
      });
    });

    it('refuse un payload binaire annoncé en image/jpeg avec mauvais marqueur SOI', async () => {
      const svc = createWelcomeUploadsService(dir);
      const fake = Buffer.from([0xff, 0xd8, 0xee, 0x00, 0x00]);
      await expect(svc.save(GUILD, 'welcome', dataUrlOf('image/jpeg', fake))).rejects.toMatchObject(
        {
          reason: 'invalid-image-content',
        },
      );
    });

    it('refuse un RIFF non-WEBP annoncé en image/webp (RIFF/WAVE par exemple)', async () => {
      const svc = createWelcomeUploadsService(dir);
      // RIFF...WAVE — vrai header WAV, pas WebP.
      const wave = Buffer.from([
        0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45,
      ]);
      await expect(svc.save(GUILD, 'welcome', dataUrlOf('image/webp', wave))).rejects.toMatchObject(
        {
          reason: 'invalid-image-content',
        },
      );
    });

    it('refuse un PNG avec en-tête JPEG (mismatch MIME ↔ contenu)', async () => {
      const svc = createWelcomeUploadsService(dir);
      // Bytes JPEG-valides mais MIME PNG annoncé.
      await expect(
        svc.save(GUILD, 'welcome', dataUrlOf('image/png', JPEG_HEADER)),
      ).rejects.toMatchObject({
        reason: 'invalid-image-content',
      });
    });

    it('refuse un buffer trop court pour porter une signature (4 octets en image/png)', async () => {
      const svc = createWelcomeUploadsService(dir);
      const tooShort = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
      await expect(
        svc.save(GUILD, 'welcome', dataUrlOf('image/png', tooShort)),
      ).rejects.toMatchObject({
        reason: 'invalid-image-content',
      });
    });

    it('produit l erreur typée WelcomeUploadError (pas une simple Error)', async () => {
      const svc = createWelcomeUploadsService(dir);
      const html = Buffer.from('<html></html>');
      try {
        await svc.save(GUILD, 'welcome', dataUrlOf('image/png', html));
        expect.fail('save aurait dû throw');
      } catch (err) {
        expect(err).toBeInstanceOf(WelcomeUploadError);
        expect((err as WelcomeUploadError).reason).toBe('invalid-image-content');
      }
    });
  });

  describe('save — autres validations', () => {
    it('refuse un guildId non-snowflake', async () => {
      const svc = createWelcomeUploadsService(dir);
      await expect(
        svc.save('not-a-snowflake', 'welcome', dataUrlOf('image/png', PNG_HEADER)),
      ).rejects.toMatchObject({ reason: 'invalid-guild' });
    });

    it('refuse un MIME non supporté', async () => {
      const svc = createWelcomeUploadsService(dir);
      await expect(
        svc.save(GUILD, 'welcome', dataUrlOf('image/gif', PNG_HEADER)),
      ).rejects.toMatchObject({ reason: 'invalid-mime' });
    });

    it('refuse un dataUrl malformé', async () => {
      const svc = createWelcomeUploadsService(dir);
      await expect(svc.save(GUILD, 'welcome', 'not-a-data-url')).rejects.toMatchObject({
        reason: 'invalid-base64',
      });
    });
  });
});
