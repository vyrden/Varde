import { describe, expect, it } from 'vitest';

import {
  AppError,
  ConflictError,
  DependencyFailureError,
  ModuleError,
  NotFoundError,
  PermissionDeniedError,
  ValidationError,
} from '../../src/errors.js';

describe('AppError', () => {
  it('expose code, message et nom de classe', () => {
    const err = new AppError('test_code', 'Message test');
    expect(err.code).toBe('test_code');
    expect(err.message).toBe('Message test');
    expect(err.name).toBe('AppError');
  });

  it('chaîne la cause', () => {
    const cause = new Error('cause originale');
    const err = new AppError('wrap', 'Wrapper', { cause });
    expect(err.cause).toBe(cause);
  });

  it('stocke metadata et httpStatus optionnels', () => {
    const err = new AppError('test', 'msg', {
      httpStatus: 418,
      metadata: { field: 'value' },
    });
    expect(err.httpStatus).toBe(418);
    expect(err.metadata).toEqual({ field: 'value' });
  });

  it('toJSON expose uniquement name/code/message/metadata', () => {
    const err = new AppError('test', 'msg', {
      metadata: { field: 'value' },
      cause: new Error('secrète'),
    });
    const json = err.toJSON();
    expect(json).toEqual({
      name: 'AppError',
      code: 'test',
      message: 'msg',
      metadata: { field: 'value' },
    });
    expect('cause' in json).toBe(false);
    expect('stack' in json).toBe(false);
  });
});

describe('Sous-classes canoniques', () => {
  it('ValidationError — code validation_error, HTTP 400', () => {
    const err = new ValidationError('champ manquant');
    expect(err.code).toBe('validation_error');
    expect(err.httpStatus).toBe(400);
    expect(err.name).toBe('ValidationError');
  });

  it('NotFoundError — code not_found, HTTP 404', () => {
    const err = new NotFoundError('guild introuvable');
    expect(err.code).toBe('not_found');
    expect(err.httpStatus).toBe(404);
  });

  it('PermissionDeniedError — code permission_denied, HTTP 403', () => {
    const err = new PermissionDeniedError('permission manquante');
    expect(err.code).toBe('permission_denied');
    expect(err.httpStatus).toBe(403);
  });

  it('ConflictError — code conflict, HTTP 409', () => {
    const err = new ConflictError('état invalide');
    expect(err.code).toBe('conflict');
    expect(err.httpStatus).toBe(409);
  });

  it('DependencyFailureError — code dependency_failure, HTTP 502', () => {
    const err = new DependencyFailureError('postgres hors service');
    expect(err.code).toBe('dependency_failure');
    expect(err.httpStatus).toBe(502);
  });

  it('ModuleError expose moduleId et l injecte dans metadata', () => {
    const err = new ModuleError('moderation', 'handler crashed');
    expect(err.code).toBe('module_error');
    expect(err.httpStatus).toBe(500);
    expect(err.moduleId).toBe('moderation');
    expect(err.metadata).toEqual({ moduleId: 'moderation' });
  });

  it('ModuleError fusionne metadata existante avec moduleId', () => {
    const err = new ModuleError('moderation', 'msg', {
      metadata: { attempt: 3 },
    });
    expect(err.metadata).toEqual({ attempt: 3, moduleId: 'moderation' });
  });
});

describe('Hiérarchie', () => {
  it('toutes les sous-classes sont des AppError et des Error', () => {
    for (const err of [
      new ValidationError('x'),
      new NotFoundError('x'),
      new PermissionDeniedError('x'),
      new ConflictError('x'),
      new DependencyFailureError('x'),
      new ModuleError('m', 'x'),
    ]) {
      expect(err).toBeInstanceOf(AppError);
      expect(err).toBeInstanceOf(Error);
    }
  });

  it('AppError n est pas une instance d une sous-classe', () => {
    expect(new AppError('x', 'y')).not.toBeInstanceOf(ValidationError);
  });
});
