// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useTasks } from '../src/stores/tasks';
import { useHabits } from '../src/stores/habits';
import { useRoutine } from '../src/stores/routine';
import { useAssistant } from '../src/stores/assistant';
import { usePlanning } from '../src/stores/planning';
import { useLifePlanning } from '../src/stores/lifePlanning';
import { useFocusExecution } from '../src/stores/focusExecution';
import {
  BACKUP_KEYS,
  exportFullBackup,
  parseBackup,
  recoverBackup,
  RESTORE_JOURNAL,
  restoreBackup,
  snapshot,
} from '../src/services/fullBackup';
import { emptyLifePlanning, LIFE_PLANNING_KEY } from '../src/services/lifePlanningRepository';
beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
});
afterEach(() => vi.restoreAllMocks());
describe('complete backup', () => {
  it('round-trips legacy data and all new data, preserving unrelated browser keys', () => {
    const tasks = useTasks();
    tasks.data.categories.push({ id: 'extra', name: 'Exemplo', color: '#112233' });
    useHabits().save({
      id: 'habit',
      name: 'Hábito de exemplo',
      description: '',
      categoryId: null,
      icon: 'book',
      frequency: { kind: 'daily' },
      preferredTime: '',
      createdAt: '2026-11-01T12:00:00Z',
      status: 'active',
      plans: [{ from: '2026-11-01', frequency: { kind: 'daily' }, active: true }],
    });
    useRoutine().save({ timer: true });
    useAssistant().save({ imminentMinutes: 10 });
    usePlanning().preferences({ maxWorkMinutes: 180 });
    useLifePlanning().saveArea({ id: 'a', name: 'Área' });
    useFocusExecution().start({ key: 'task:example', title: 'Exemplo', type: 'task' }, 100);
    localStorage.setItem('focus.performance.v1', JSON.stringify({ version: 1, snapshots: [] }));
    localStorage.setItem(
      'focus.integrations.platforms.v1',
      JSON.stringify({ version: 1, platforms: [] }),
    );
    localStorage.setItem(
      'focus.integrations.iema.v1',
      JSON.stringify({
        version: 1,
        enabled: false,
        connectionId: '',
        baseUrl: 'https://web.iema.ma.gov.br/iema-suporte-cti/api/v1',
        lastSync: null,
        tickets: [],
      }),
    );
    localStorage.setItem('focus.theme', 'dark');
    const original = snapshot();
    const raw = exportFullBackup();
    const backup = parseBackup(raw);
    localStorage.setItem('focus.theme', 'light');
    localStorage.setItem('unrelated', 'preserve');
    restoreBackup(backup, snapshot(), true);
    expect(snapshot()).toEqual(original);
    expect(localStorage.getItem('unrelated')).toBe('preserve');
    expect(localStorage.getItem(RESTORE_JOURNAL)).toBeNull();
    setActivePinia(createPinia());
    expect(useTasks().data.categories).toEqual(tasks.data.categories);
    expect(useLifePlanning().data.areas[0]!.name).toBe('Área');
    expect(useHabits().data.habits[0]!.name).toBe('Hábito de exemplo');
  });
  it('excludes unknown keys and credentials', () => {
    localStorage.setItem('credential-test', 'secret-placeholder');
    expect(exportFullBackup()).not.toContain('secret-placeholder');
  });
  it('requires explicit confirmation and does not mutate on rejection', () => {
    const before = snapshot();
    expect(() => restoreBackup(before, before, false)).toThrow('Confirme');
    expect(snapshot()).toEqual(before);
    expect(localStorage.getItem(RESTORE_JOURNAL)).toBeNull();
  });
  it.each(BACKUP_KEYS.filter((k) => k !== 'focus.execution.v1'))(
    'rejects invalid data in %s before writing anything',
    (key) => {
      const before = snapshot();
      const backup = snapshot();
      backup.entries[key] = 'null';
      expect(() => parseBackup(JSON.stringify(backup))).toThrow('inválido');
      expect(() => restoreBackup(backup, before, true)).toThrow();
      expect(snapshot()).toEqual(before);
    },
  );
  it.each(['{}', '{bad', '{"version":2}', '{"format":"focus-full","version":1,"entries":{}}'])(
    'rejects incompatible envelopes %s',
    (raw) => {
      expect(() => parseBackup(raw)).toThrow();
    },
  );
  it('rejects unknown keys, duplicates and colliding blocks in new planning data', () => {
    const backup = snapshot();
    backup.entries[LIFE_PLANNING_KEY] = JSON.stringify({
      ...emptyLifePlanning(),
      areas: [
        { id: 'a', name: 'A' },
        { id: 'a', name: 'B' },
      ],
    });
    expect(() => parseBackup(JSON.stringify(backup))).toThrow();
    expect(() => parseBackup(JSON.stringify({ ...snapshot(), unexpected: true }))).toThrow();
  });
  it('detects changes since the confirmation preview', () => {
    const before = snapshot();
    localStorage.setItem('focus.theme', 'dark');
    expect(() => restoreBackup(before, before, true)).toThrow('mudaram');
    expect(localStorage.getItem('focus.theme')).toBe('dark');
  });
  it('does not touch current data if the recovery journal cannot be saved', () => {
    localStorage.setItem('focus.theme', 'dark');
    const before = snapshot();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw Error('quota');
    });
    expect(() => restoreBackup(before, before, true)).toThrow();
    expect(snapshot()).toEqual(before);
  });
  it('rolls back all entries on a mid-import failure including pre-existing invalid bytes', () => {
    const incoming = snapshot();
    localStorage.setItem('focus.v1', 'old-malformed-bytes');
    localStorage.setItem('focus.theme', 'dark');
    const previous = snapshot();
    incoming.entries[LIFE_PLANNING_KEY] = JSON.stringify(emptyLifePlanning());
    const original = Storage.prototype.setItem;
    let failed = false;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key === LIFE_PLANNING_KEY && !failed) {
        failed = true;
        throw Error('quota');
      }
      return original.call(this, key, value);
    });
    expect(() => restoreBackup(incoming, previous, true)).toThrow('restaurados');
    expect(snapshot()).toEqual(previous);
    expect(localStorage.getItem(RESTORE_JOURNAL)).toBeNull();
  });
  it('recovers interrupted imports before app startup and preserves the journal if recovery fails', () => {
    localStorage.setItem('focus.theme', 'dark');
    const previous = snapshot();
    localStorage.setItem(RESTORE_JOURNAL, JSON.stringify(previous));
    localStorage.setItem('focus.theme', 'light');
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw Error('denied');
    });
    expect(() => recoverBackup()).toThrow();
    expect(localStorage.getItem(RESTORE_JOURNAL)).not.toBeNull();
    spy.mockRestore();
    recoverBackup();
    expect(snapshot()).toEqual(previous);
    expect(localStorage.getItem(RESTORE_JOURNAL)).toBeNull();
  });
});
