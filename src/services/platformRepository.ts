import type { Platform } from '../types/platforms';
import { SheetsRepository, validPlatform } from './integrations/sheets/repository';

export const PLATFORMS_KEY = 'focus.integrations.platforms.v1';
const fields = [
  'key',
  'source',
  'name',
  'originalId',
  'originalStatus',
  'status',
  'documentation',
  'link',
  'notes',
  'owner',
  'originalPriority',
  'priority',
  'dueDate',
  'row',
  'syncedAt',
  'estimate',
  'blocked',
  'localNotes',
  'nextAction',
  'progress',
  'complexity',
  'archived',
  'completedDate',
  'steps',
] as const;
export function validatePlatforms(platforms: Platform[]) {
  if (
    !Array.isArray(platforms) ||
    new Set(platforms.map((p) => p?.key)).size !== platforms.length ||
    platforms.some(
      (p) =>
        !p ||
        !['manual', 'excel', 'sheets'].includes(p.source) ||
        typeof p.key !== 'string' ||
        !p.key ||
        !validPlatform({ ...p, source: 'sheets', key: 'sheets:validation' }) ||
        (p.complexity != null && !['low', 'medium', 'high'].includes(p.complexity)) ||
        (p.archived !== undefined && typeof p.archived !== 'boolean') ||
        (p.completedDate != null &&
          (!/^\d{4}-\d{2}-\d{2}$/.test(p.completedDate) ||
            !Number.isFinite(Date.parse(p.completedDate)) ||
            new Date(p.completedDate).toISOString().slice(0, 10) !== p.completedDate)) ||
        (p.steps !== undefined &&
          (!Array.isArray(p.steps) ||
            p.steps.some(
              (s) =>
                !s ||
                typeof s.id !== 'string' ||
                typeof s.title !== 'string' ||
                typeof s.done !== 'boolean',
            ) ||
            new Set(p.steps.map((s) => s.id)).size !== p.steps.length)),
    )
  )
    throw new Error('Dados de plataformas inválidos. O original foi preservado.');
}
function allowed(platforms: Platform[]): Platform[] {
  return platforms.map(
    (p) =>
      Object.fromEntries(
        fields
          .filter((k) => p[k] !== undefined)
          .map((k) => [
            k,
            k === 'steps'
              ? p.steps?.map((s) => ({ id: s.id, title: s.title, done: s.done }))
              : p[k],
          ]),
      ) as unknown as Platform,
  );
}
export class PlatformRepository {
  private snapshot: string | null | undefined;
  constructor(private storage: Storage = localStorage) {}
  load(): Platform[] {
    const raw = this.storage.getItem(PLATFORMS_KEY);
    this.snapshot = raw;
    if (raw !== null) {
      const data = JSON.parse(raw);
      if (data.version !== 1) throw new Error();
      validatePlatforms(data.platforms);
      return allowed(data.platforms);
    }
    // Read-only migration: the entire old cache and OAuth configuration remain untouched.
    const legacy = new SheetsRepository(this.storage).load();
    return allowed(legacy?.platforms ?? []);
  }
  save(platforms: Platform[]) {
    validatePlatforms(platforms);
    if (this.snapshot !== undefined && this.storage.getItem(PLATFORMS_KEY) !== this.snapshot)
      throw new Error('As plataformas mudaram em outra sessão. Recarregue antes de salvar.');
    const next = JSON.stringify({ version: 1, platforms: allowed(platforms) });
    this.storage.setItem(PLATFORMS_KEY, next);
    this.snapshot = next;
  }
}
