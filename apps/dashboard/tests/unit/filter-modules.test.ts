import { describe, expect, it } from 'vitest';
import type { ModuleListItemDto } from '../../lib/api-client';
import { filterModules, type ModuleFilterStatus } from '../../lib/filter-modules';

const make = (
  id: string,
  name: string,
  enabled: boolean,
  description = '',
  shortDescription: string | null = null,
): ModuleListItemDto => ({
  id,
  name,
  version: '1.0.0',
  description,
  enabled,
  permissions: [],
  category: null,
  icon: null,
  shortDescription,
  isPinned: false,
  lastConfiguredAt: null,
});

const ALL_STATUS = 'all' satisfies ModuleFilterStatus;
const ACTIVE_STATUS = 'active' satisfies ModuleFilterStatus;
const INACTIVE_STATUS = 'inactive' satisfies ModuleFilterStatus;

describe('filterModules', () => {
  const sample: readonly ModuleListItemDto[] = [
    make('moderation', 'Moderation', true, 'Sanctions et automod.', 'Modérer un serveur'),
    make('welcome', 'Welcome', false, 'Messages d arrivée.', 'Accueil et départs'),
    make('logs', 'Logs', true, 'Journal des évènements.', null),
    make('reaction-roles', 'Reaction-roles', false, 'Auto-attribution de rôles.', null),
  ];

  it('renvoie tous les modules sans query ni filtre', () => {
    const result = filterModules(sample, '', ALL_STATUS);
    expect(result.map((m) => m.id)).toEqual(['moderation', 'welcome', 'logs', 'reaction-roles']);
  });

  it('filtre par statut actif', () => {
    const result = filterModules(sample, '', ACTIVE_STATUS);
    expect(result.map((m) => m.id)).toEqual(['moderation', 'logs']);
  });

  it('filtre par statut inactif', () => {
    const result = filterModules(sample, '', INACTIVE_STATUS);
    expect(result.map((m) => m.id)).toEqual(['welcome', 'reaction-roles']);
  });

  it('cherche dans le nom (case-insensitive)', () => {
    const result = filterModules(sample, 'mod', ALL_STATUS);
    expect(result.map((m) => m.id)).toEqual(['moderation']);
  });

  it('cherche aussi dans la description longue', () => {
    const result = filterModules(sample, 'évènement', ALL_STATUS);
    expect(result.map((m) => m.id)).toEqual(['logs']);
  });

  it('cherche aussi dans la shortDescription quand elle existe', () => {
    const result = filterModules(sample, 'arrivée', ALL_STATUS);
    expect(result.map((m) => m.id)).toEqual(['welcome']);
  });

  it('cherche aussi dans l id (pour les modules tiers sans nom unique)', () => {
    const result = filterModules(sample, 'reaction-roles', ALL_STATUS);
    expect(result.map((m) => m.id)).toEqual(['reaction-roles']);
  });

  it('ignore la casse et les espaces autour de la query', () => {
    const result = filterModules(sample, '  WELCOME  ', ALL_STATUS);
    expect(result.map((m) => m.id)).toEqual(['welcome']);
  });

  it('combine query et filtre statut (recherche dans actifs uniquement)', () => {
    const result = filterModules(sample, 'mod', ACTIVE_STATUS);
    expect(result.map((m) => m.id)).toEqual(['moderation']);
  });

  it('renvoie une liste vide quand aucun match', () => {
    const result = filterModules(sample, 'xyz123', ALL_STATUS);
    expect(result).toEqual([]);
  });

  it('renvoie une liste vide sur une entrée vide', () => {
    const result = filterModules([], 'mod', ALL_STATUS);
    expect(result).toEqual([]);
  });

  it('préserve l ordre des modules en entrée', () => {
    const result = filterModules(sample, '', ALL_STATUS);
    expect(result.map((m) => m.id)).toEqual(['moderation', 'welcome', 'logs', 'reaction-roles']);
  });
});
