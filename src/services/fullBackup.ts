import { LocalRepository } from './repository';
import { LocalHabitRepository } from './habitRepository';
import { validateData as validateSheets } from './integrations/sheets/repository';
import { validatePlatforms } from './platformRepository';
import { validRoutine } from '../stores/routine';
import { validAssistant } from '../stores/assistant';
import { validatePlanning } from '../stores/planning';
import { validateIema } from '../stores/iema';
import { validExecution } from '../stores/focusExecution';
import { validatePerformance } from '../stores/performanceHistory';
import { LIFE_PLANNING_KEY, validateLifePlanning } from './lifePlanningRepository';

// An explicit allowlist excludes native vault secrets and unrelated browser data.
export const BACKUP_KEYS = [
  'focus.v1',
  'focus.habits.v1',
  'focus.routine.v1',
  'focus.assistant.v1',
  'focus.planning.v1',
  'focus.performance.v1',
  'focus.execution.v1',
  'focus.integrations.platforms.v1',
  'focus.integrations.sheets.v1',
  'focus.integrations.iema.v1',
  LIFE_PLANNING_KEY,
  'focus.theme',
] as const;
type BackupKey = (typeof BACKUP_KEYS)[number];
export interface FullBackup {
  format: 'focus-full';
  version: 1;
  entries: Record<BackupKey, string | null>;
}
export const RESTORE_JOURNAL = 'focus.restore-journal.v1';
export function snapshot(storage: Pick<Storage, 'getItem'> = localStorage): FullBackup {
  return {
    format: 'focus-full',
    version: 1,
    entries: Object.fromEntries(
      BACKUP_KEYS.map((key) => [key, storage.getItem(key)]),
    ) as FullBackup['entries'],
  };
}
function validateEntries(value: unknown): asserts value is FullBackup {
  const b = value as FullBackup;
  if (
    !b ||
    b.format !== 'focus-full' ||
    b.version !== 1 ||
    !b.entries ||
    Object.keys(b).sort().join() !== ['entries', 'format', 'version'].join() ||
    Object.keys(b.entries).sort().join() !== [...BACKUP_KEYS].sort().join() ||
    Object.values(b.entries).some((v) => v !== null && typeof v !== 'string')
  )
    throw Error('Formato de backup inválido.');
}
export function validateBackup(value: unknown): asserts value is FullBackup {
  validateEntries(value);
  for (const key of BACKUP_KEYS) {
    const raw = value.entries[key];
    if (raw === null) continue;
    if (key === 'focus.theme') {
      if (!['light', 'dark'].includes(raw)) throw Error();
      continue;
    }
    const d = JSON.parse(raw);
    const reader = { getItem: () => raw, setItem: () => {} };
    switch (key) {
      case 'focus.v1':
        new LocalRepository(reader).load();
        break;
      case 'focus.habits.v1':
        new LocalHabitRepository(reader).load();
        break;
      case 'focus.routine.v1':
        if (!validRoutine(d)) throw Error();
        break;
      case 'focus.assistant.v1':
        if (!validAssistant(d)) throw Error();
        break;
      case 'focus.planning.v1':
        validatePlanning(d);
        break;
      case 'focus.performance.v1':
        validatePerformance(d);
        break;
      case 'focus.execution.v1':
        if (!validExecution(d)) throw Error();
        break;
      case 'focus.integrations.platforms.v1':
        if (d.version !== 1) throw Error();
        validatePlatforms(d.platforms);
        break;
      case 'focus.integrations.sheets.v1':
        validateSheets(d);
        break;
      case 'focus.integrations.iema.v1':
        validateIema(d);
        break;
      case LIFE_PLANNING_KEY:
        validateLifePlanning(d);
        break;
    }
  }
}
export function parseBackup(raw: string): FullBackup {
  if (raw.length > 20 * 1024 * 1024) throw Error('Backup maior que 20 MB.');
  try {
    const value: unknown = JSON.parse(raw);
    validateBackup(value);
    return value;
  } catch {
    throw Error('Backup inválido ou incompatível. Nenhum dado foi alterado.');
  }
}
export function exportFullBackup(storage: Pick<Storage, 'getItem'> = localStorage): string {
  const value = snapshot(storage);
  validateBackup(value);
  return JSON.stringify(value, null, 2);
}
function writeEntries(value: FullBackup, storage: Storage) {
  for (const key of BACKUP_KEYS) {
    const raw = value.entries[key];
    if (raw === null) storage.removeItem(key);
    else storage.setItem(key, raw);
  }
}
export function recoverBackup(storage: Storage = localStorage) {
  const journal = storage.getItem(RESTORE_JOURNAL);
  if (journal === null) return;
  const previous: unknown = JSON.parse(journal);
  // Recovery must preserve even pre-existing malformed data byte for byte.
  validateEntries(previous);
  writeEntries(previous, storage);
  storage.removeItem(RESTORE_JOURNAL);
}
export function restoreBackup(
  value: FullBackup,
  expected: FullBackup,
  confirmed: boolean,
  storage: Storage = localStorage,
) {
  if (!confirmed) throw Error('Confirme a substituição dos dados antes de importar.');
  validateBackup(value);
  if (storage.getItem(RESTORE_JOURNAL) !== null)
    throw Error('Há uma restauração pendente. Recarregue para recuperar os dados.');
  const previous = snapshot(storage);
  if (JSON.stringify(previous) !== JSON.stringify(expected))
    throw Error('Os dados mudaram desde a seleção do backup. Selecione o arquivo novamente.');
  // Persist rollback before the first mutation; a full disk leaves current data untouched.
  storage.setItem(RESTORE_JOURNAL, JSON.stringify(previous));
  try {
    writeEntries(value, storage);
    storage.removeItem(RESTORE_JOURNAL);
  } catch {
    try {
      recoverBackup(storage);
    } catch {
      throw Error(
        'Restauração interrompida. A cópia de recuperação foi preservada. Recarregue para recuperar antes de continuar.',
      );
    }
    throw Error('Não foi possível importar. Os dados anteriores foram restaurados.');
  }
}
