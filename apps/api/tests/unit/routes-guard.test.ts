import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Test statique : pour chaque fichier `apps/api/src/routes/*.ts`,
 * vérifie que toute route mutante (POST/PUT/PATCH/DELETE) appelle
 * `requireGuildAdmin` dans son handler. Empêche qu'une PR future
 * ajoute une route mutante sans la protéger par la garde MANAGE_GUILD.
 *
 * Approche : parse texte (regex robustes) plutôt que AST. Beaucoup
 * plus simple à maintenir, et l'approximation tient parce que :
 *
 * - On lit la ligne `app.<verb><...>(`
 * - On compte les parenthèses jusqu'à la fermeture du `app.<verb>(...)`
 * - Dans cette fenêtre, on cherche `requireGuildAdmin(`. Présent → OK.
 *   Absent → on regarde une whitelist explicite de routes publiques
 *   (santé, etc.). Pas de match dans la whitelist non plus → fail.
 *
 * Une route peut explicitement opt-out via le commentaire
 * `// public-route: <raison>` posé sur la ligne juste au-dessus de
 * l'enregistrement. Ce mécanisme garde la trace dans le code de tout
 * endpoint public, et signale au reviewer que le choix est délibéré.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const ROUTES_DIR = join(HERE, '..', '..', 'src', 'routes');

const MUTATING_VERBS = ['post', 'put', 'patch', 'delete'] as const;

/**
 * Trouve l'index de la `)` qui ferme le premier `(` de la chaîne.
 * Compte les parenthèses en ignorant : strings (simples, doubles,
 * templates), commentaires `// ...` et `/* ... *​/`. Sans la gestion
 * des commentaires, une apostrophe française (« l'admin ») dans un
 * commentaire serait lue comme un string opener et le parseur
 * resterait bloqué jusqu'à EOF.
 */
const findMatchingClose = (src: string, openIdx: number): number => {
  let depth = 0;
  let inString: '"' | "'" | '`' | null = null;
  let inComment: 'line' | 'block' | null = null;
  let isEscaped = false;
  for (let i = openIdx; i < src.length; i += 1) {
    const ch = src[i];
    const next = src[i + 1];
    if (isEscaped) {
      isEscaped = false;
      continue;
    }
    if (inComment === 'line') {
      if (ch === '\n') inComment = null;
      continue;
    }
    if (inComment === 'block') {
      if (ch === '*' && next === '/') {
        inComment = null;
        i += 1;
      }
      continue;
    }
    if (inString) {
      if (ch === '\\') {
        isEscaped = true;
      } else if (ch === inString) {
        inString = null;
      }
      continue;
    }
    if (ch === '/' && next === '/') {
      inComment = 'line';
      i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      inComment = 'block';
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inString = ch;
      continue;
    }
    if (ch === '(') depth += 1;
    else if (ch === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
};

interface MutatingRoute {
  readonly file: string;
  readonly verb: (typeof MUTATING_VERBS)[number];
  readonly line: number;
  readonly snippet: string;
  readonly hasGuard: boolean;
  readonly publicReason: string | null;
}

const collectMutatingRoutes = async (): Promise<readonly MutatingRoute[]> => {
  const entries = await readdir(ROUTES_DIR);
  const routes: MutatingRoute[] = [];
  for (const entry of entries) {
    if (!entry.endsWith('.ts')) continue;
    const path = join(ROUTES_DIR, entry);
    const src = await readFile(path, 'utf8');
    const lines = src.split('\n');
    for (const verb of MUTATING_VERBS) {
      // Match `app.post(...)` ou `app.post<...>(...)`. Le `<` accepte
      // les paramètres génériques TypeScript multi-lignes.
      const re = new RegExp(`app\\.${verb}(?:<[^>]*>)?\\s*\\(`, 'gm');
      let match: RegExpExecArray | null = re.exec(src);
      while (match !== null) {
        const openIdx = src.indexOf('(', match.index);
        const closeIdx = findMatchingClose(src, openIdx);
        if (closeIdx === -1) {
          throw new Error(
            `${entry}: parenthèse non fermée à offset ${openIdx} (regex sur app.${verb})`,
          );
        }
        const block = src.slice(openIdx, closeIdx);
        const hasGuard = /\brequireGuildAdmin\s*\(/.test(block);
        // Ligne où apparaît `app.<verb>(`.
        const lineIdx = src.slice(0, match.index).split('\n').length - 1;
        // Cherche un commentaire `// public-route:` dans les 3
        // lignes au-dessus.
        let publicReason: string | null = null;
        for (let l = Math.max(0, lineIdx - 3); l < lineIdx; l += 1) {
          const lineRaw = lines[l];
          if (lineRaw === undefined) continue;
          const m = /\/\/\s*public-route:\s*(.+)$/.exec(lineRaw);
          if (m && m[1] !== undefined) {
            publicReason = m[1].trim();
          }
        }
        routes.push({
          file: entry,
          verb,
          line: lineIdx + 1,
          snippet:
            src.slice(match.index, Math.min(match.index + 80, src.length)).split('\n')[0] ?? '',
          hasGuard,
          publicReason,
        });
        match = re.exec(src);
      }
    }
  }
  return routes;
};

describe('routes mutantes — garde requireGuildAdmin', () => {
  it('chaque route POST/PUT/PATCH/DELETE appelle requireGuildAdmin (ou est marquée public-route)', async () => {
    const routes = await collectMutatingRoutes();
    // Sanity : on doit en trouver au moins quelques-unes (sinon le
    // parser est cassé et on aurait un faux négatif).
    expect(routes.length).toBeGreaterThan(10);

    const unprotected = routes.filter((r) => !r.hasGuard && r.publicReason === null);
    if (unprotected.length > 0) {
      const detail = unprotected
        .map((r) => `  - ${r.file}:${r.line} (${r.verb.toUpperCase()}) — ${r.snippet}`)
        .join('\n');
      throw new Error(
        `${unprotected.length} route(s) mutante(s) sans requireGuildAdmin et sans annotation ` +
          `\`// public-route: <raison>\` :\n${detail}\n\n` +
          `Ajoute \`requireGuildAdmin(app, request, guildId, discord)\` dans le handler, ` +
          `ou — si l'endpoint est volontairement public — pose le commentaire ` +
          `\`// public-route: <raison>\` sur la ligne au-dessus de l'enregistrement.`,
      );
    }
    expect(unprotected).toEqual([]);
  });

  it('rapporte les routes publiques explicitement annotées (pour traçabilité)', async () => {
    const routes = await collectMutatingRoutes();
    const publicRoutes = routes.filter((r) => r.publicReason !== null);
    // Aujourd'hui : 0 route mutante publique. Si ça change, le test
    // ne fail pas — il documente la liste, pour qu'un reviewer la
    // voit dans le diff.
    for (const r of publicRoutes) {
      expect(r.publicReason).toBeTruthy();
    }
  });
});
