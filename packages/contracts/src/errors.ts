/**
 * Hiérarchie d'erreurs métier du projet.
 *
 * Toutes les erreurs métier héritent d'{@link AppError}. Les erreurs
 * d'infrastructure (Node, driver DB, etc.) restent des erreurs natives
 * et sont encapsulées via {@link DependencyFailureError} lorsqu'elles
 * traversent la frontière API.
 *
 * Les codes d'erreur sont stables dans le temps : ils apparaissent
 * dans l'audit log et les réponses API. Changer un code = changement
 * majeur.
 */

/** Métadonnées libres attachées à une erreur. Aucune donnée sensible. */
export type ErrorMetadata = Readonly<Record<string, unknown>>;

/** Options de construction d'une {@link AppError}. */
export interface AppErrorOptions {
  readonly cause?: Error;
  readonly httpStatus?: number;
  readonly metadata?: ErrorMetadata;
}

/** Options des sous-classes (pas de httpStatus, fixé par la classe). */
export interface AppErrorSubclassOptions {
  readonly cause?: Error;
  readonly metadata?: ErrorMetadata;
}

/**
 * Erreur métier de base. Toutes les erreurs métier du projet
 * héritent d'`AppError`.
 */
export class AppError extends Error {
  /** Code canonique stable. Apparaît dans les logs et les audits. */
  readonly code: string;
  /**
   * Code HTTP associé pour les erreurs qui remontent à l'API.
   * `undefined` pour les erreurs purement internes.
   */
  readonly httpStatus: number | undefined;
  /**
   * Métadonnées structurées. Ne jamais y stocker de secrets ni de
   * contenu utilisateur brut : elles sont sérialisées dans les logs
   * et les réponses d'erreur.
   */
  readonly metadata: ErrorMetadata | undefined;

  constructor(code: string, message: string, options?: AppErrorOptions) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = new.target.name;
    this.code = code;
    this.httpStatus = options?.httpStatus;
    this.metadata = options?.metadata;
  }

  /**
   * Sérialisation JSON sans fuite. Expose uniquement `name`, `code`,
   * `message` et `metadata`. Omet volontairement `stack` et `cause`
   * pour qu'un `JSON.stringify` sur une erreur ne dévoile pas de
   * trace d'exécution côté réponse API.
   */
  toJSON(): {
    readonly name: string;
    readonly code: string;
    readonly message: string;
    readonly metadata: ErrorMetadata | undefined;
  } {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      metadata: this.metadata,
    };
  }
}

/** Entrée invalide (payload, config, arguments). */
export class ValidationError extends AppError {
  constructor(message: string, options?: AppErrorSubclassOptions) {
    super('validation_error', message, { ...options, httpStatus: 400 });
  }
}

/** Ressource attendue introuvable. */
export class NotFoundError extends AppError {
  constructor(message: string, options?: AppErrorSubclassOptions) {
    super('not_found', message, { ...options, httpStatus: 404 });
  }
}

/** Vérification de permission applicative en échec. */
export class PermissionDeniedError extends AppError {
  constructor(message: string, options?: AppErrorSubclassOptions) {
    super('permission_denied', message, { ...options, httpStatus: 403 });
  }
}

/** Conflit d'état (concurrence, transition invalide, unicité). */
export class ConflictError extends AppError {
  constructor(message: string, options?: AppErrorSubclassOptions) {
    super('conflict', message, { ...options, httpStatus: 409 });
  }
}

/** Dépendance externe indisponible (Discord API, DB, Redis, LLM). */
export class DependencyFailureError extends AppError {
  constructor(message: string, options?: AppErrorSubclassOptions) {
    super('dependency_failure', message, { ...options, httpStatus: 502 });
  }
}

/** Erreur survenue dans un module. Encapsule l'erreur sous-jacente. */
export class ModuleError extends AppError {
  /** Id du module dans lequel l'erreur a été levée. */
  readonly moduleId: string;

  constructor(moduleId: string, message: string, options?: AppErrorSubclassOptions) {
    super('module_error', message, {
      ...(options?.cause !== undefined ? { cause: options.cause } : {}),
      httpStatus: 500,
      metadata: { ...options?.metadata, moduleId },
    });
    this.moduleId = moduleId;
  }
}

/** Raisons d'un échec d'envoi Discord, stables dans les logs et API. */
export type DiscordSendErrorReason =
  | 'channel-not-found'
  | 'missing-permission'
  | 'rate-limit-exhausted'
  | 'unknown';

/**
 * Échec d'envoi d'un message ou embed Discord. Utilisée par
 * `DiscordService.sendEmbed` et consommable par les modules pour
 * réagir au cas (marquer une route `broken`, bufferiser, etc.).
 *
 * Le champ `reason` est aussi injecté dans `metadata.reason` pour
 * que les serializers (logs, audit) le voient sans introspection
 * typée.
 */
export class DiscordSendError extends AppError {
  readonly reason: DiscordSendErrorReason;

  constructor(reason: DiscordSendErrorReason, message: string, options?: AppErrorSubclassOptions) {
    super('discord_send_failed', message, {
      ...(options?.cause !== undefined ? { cause: options.cause } : {}),
      httpStatus: 502,
      metadata: { ...options?.metadata, reason },
    });
    this.reason = reason;
  }
}
