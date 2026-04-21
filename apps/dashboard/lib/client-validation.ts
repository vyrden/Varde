import Ajv, { type ErrorObject } from 'ajv';

/**
 * Validation JSON Schema côté client. L'API renvoie déjà un
 * `configSchema` pour chaque module (converti depuis Zod 4 via
 * `z.toJSONSchema()`), donc on l'utilise pour faire un pré-check
 * dans le navigateur avant d'envoyer le PUT. Avantage :
 * - feedback immédiat sur les erreurs de borne (min / max) sans
 *   aller-retour serveur ;
 * - évite de gaspiller un tour de requête quand le formulaire est
 *   clairement invalide ;
 * - reste un filet : la source de vérité de validation reste l'API,
 *   qui re-valide avec Zod côté serveur quoi qu'il arrive.
 *
 * On instancie un Ajv partagé (cache de `compile`) et on désactive
 * les modes `strict` pour accepter toutes les variantes de schema
 * produites par `z.toJSONSchema()` sans avoir à lister les meta-
 * schémas supportés.
 */

let cachedAjv: Ajv | null = null;

const getAjv = (): Ajv => {
  if (!cachedAjv) {
    cachedAjv = new Ajv({ allErrors: true, strict: false });
  }
  return cachedAjv;
};

export interface ClientValidationIssue {
  readonly path: ReadonlyArray<string | number>;
  readonly message: string;
}

export type ClientValidationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly issues: readonly ClientValidationIssue[] };

const instancePathToSegments = (instancePath: string): Array<string | number> => {
  if (!instancePath) return [];
  const segments = instancePath.split('/').slice(1);
  return segments.map((segment) => {
    const decoded = segment.replace(/~1/g, '/').replace(/~0/g, '~');
    const asNumber = Number(decoded);
    return decoded !== '' && Number.isInteger(asNumber) && String(asNumber) === decoded
      ? asNumber
      : decoded;
  });
};

const describeIssue = (error: ErrorObject): ClientValidationIssue => {
  const path = instancePathToSegments(error.instancePath);
  const finalPath =
    error.keyword === 'required' && typeof error.params['missingProperty'] === 'string'
      ? [...path, error.params['missingProperty']]
      : path;
  return {
    path: finalPath,
    message: error.message ?? 'Valeur invalide.',
  };
};

/**
 * Valide `data` contre un `schema` JSON Schema. Si le schéma est
 * absent ou invalide, on renvoie `{ ok: true }` — le serveur fera
 * le check final. Cette tolérance permet de ne pas bloquer le form
 * quand un module n'expose pas de `configSchema` ou quand le schéma
 * contient des constructions non supportées par Ajv.
 */
export function validateAgainstSchema(schema: unknown, data: unknown): ClientValidationResult {
  if (typeof schema !== 'object' || schema === null) return { ok: true };

  let validate: ReturnType<Ajv['compile']>;
  try {
    validate = getAjv().compile(schema as object);
  } catch {
    return { ok: true };
  }

  const ok = validate(data);
  if (ok) return { ok: true };
  const issues = (validate.errors ?? []).map(describeIssue);
  return { ok: false, issues };
}
