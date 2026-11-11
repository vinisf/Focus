import type { Platform, SheetsData } from '../../../types/platforms';
import { platformStatuses } from '../../../types/platforms';
import { validateSheet, SheetsError } from './GoogleSheetsClient';
import { safeLink } from './normalization';
export const SHEETS_KEY = 'focus.integrations.sheets.v1';
export function validPlatform(p: Platform): boolean {
  return (
    !!p &&
    p.source === 'sheets' &&
    typeof p.key === 'string' &&
    p.key.startsWith('sheets:') &&
    typeof p.name === 'string' &&
    !!p.name.trim() &&
    (p.originalId === null || typeof p.originalId === 'string') &&
    platformStatuses.includes(p.status) &&
    [
      'originalStatus',
      'notes',
      'owner',
      'originalPriority',
      'localNotes',
      'nextAction',
      'progress',
    ].every((k) => typeof p[k as keyof Platform] === 'string') &&
    [p.documentation, p.link].every(
      (v) => v === null || (typeof v === 'string' && safeLink(v) === v),
    ) &&
    (p.priority === null || ['low', 'medium', 'high', 'urgent'].includes(p.priority)) &&
    (p.dueDate === null ||
      (typeof p.dueDate === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(p.dueDate) &&
        Number.isFinite(Date.parse(p.dueDate)))) &&
    Number.isSafeInteger(p.row) &&
    p.row > 0 &&
    Number.isFinite(Date.parse(p.syncedAt)) &&
    (p.estimate === null ||
      (Number.isFinite(p.estimate) && p.estimate > 0 && p.estimate <= 10080)) &&
    typeof p.blocked === 'boolean'
  );
}
export function validateData(data: SheetsData) {
  if (
    !data ||
    data.version !== 1 ||
    typeof data.enabled !== 'boolean' ||
    !(data.accountId === null || (typeof data.accountId === 'string' && !!data.accountId)) ||
    !Array.isArray(data.headers) ||
    data.headers.some((h) => typeof h !== 'string') ||
    !(data.lastSync === null || Number.isFinite(Date.parse(data.lastSync)))
  )
    throw new SheetsError('storage', 'Cache de plataformas inválido. O original foi preservado.');
  validateSheet(data.config.spreadsheetId, data.config.gid);
  const m = data.config.mapping;
  if (
    !Number.isSafeInteger(m.headerRow) ||
    m.headerRow < 1 ||
    !m.columns ||
    !m.statuses ||
    !m.priorities ||
    ['id', 'name', 'status', 'documentation', 'link', 'notes', 'owner', 'priority', 'due'].some(
      (k) => typeof m.columns[k as keyof typeof m.columns] !== 'string',
    ) ||
    Object.values(m.statuses).some((v) => !platformStatuses.includes(v)) ||
    Object.values(m.priorities).some((v) => !['low', 'medium', 'high', 'urgent'].includes(v))
  )
    throw new SheetsError('storage', 'Mapeamento de plataformas inválido.');
  if (
    !Array.isArray(data.platforms) ||
    !data.platforms.every(validPlatform) ||
    new Set(data.platforms.map((p) => p.key)).size !== data.platforms.length ||
    data.platforms.some(
      (p) =>
        !data.accountId ||
        !p.key.startsWith(
          `sheets:${encodeURIComponent(data.accountId)}:${data.config.spreadsheetId}:${data.config.gid}:`,
        ),
    )
  )
    throw new SheetsError('storage', 'Cache de plataformas inválido.');
}
export class SheetsRepository {
  constructor(
    private storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = localStorage,
  ) {}
  load(): SheetsData | null {
    const raw = this.storage.getItem(SHEETS_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SheetsData;
    validateData(data);
    return data;
  }
  save(data: SheetsData) {
    validateData(data);
    this.storage.setItem(SHEETS_KEY, JSON.stringify(data));
  }
  clear() {
    this.storage.removeItem(SHEETS_KEY);
  }
}
