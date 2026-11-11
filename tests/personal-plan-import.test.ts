// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import {
  emptyLifePlanning,
  LIFE_PLANNING_KEY,
  validateLifePlanning,
} from '../src/services/lifePlanningRepository';
import {
  emptyImportOptions,
  importKey,
  parsePersonalPlan,
  PERSONAL_PLAN_LIMIT,
  previewPersonalPlan,
  samePlan,
} from '../src/services/personalPlanImport';
import { useLifePlanning } from '../src/stores/lifePlanning';
import { useTasks } from '../src/stores/tasks';
import type { LifePlanningData, WeeklyBlock } from '../src/types/lifePlanning';

const block = (id = 'b', fields: Partial<WeeklyBlock> = {}): WeeklyBlock => ({
  id,
  title: 'Bloco de exemplo',
  date: '2026-11-11',
  kind: 'fixed',
  start: '10:00',
  end: '11:00',
  goalId: '',
  status: 'planned',
  ...fields,
});
function plan(): LifePlanningData {
  return {
    ...emptyLifePlanning(),
    areas: [{ id: 'a', name: 'Área de exemplo' }],
    goals: [
      {
        id: 'g',
        areaId: 'a',
        title: 'Meta de exemplo',
        description: 'Descrição de exemplo',
        horizon: 'short',
        dueDate: '',
        status: 'active',
        milestones: [{ id: 'm', title: 'Entrega de exemplo', done: false }],
        taskIds: ['existing-task'],
      },
    ],
    blocks: [block('b', { goalId: 'g' })],
  };
}
beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
});
afterEach(() => vi.restoreAllMocks());

describe('private input validation', () => {
  it('accepts version 1 plans with or without optional block description', () => {
    const incoming = plan();
    expect(parsePersonalPlan(JSON.stringify(incoming))).toEqual(incoming);
    incoming.blocks[0]!.description = 'Descrição opcional de exemplo';
    expect(parsePersonalPlan(JSON.stringify(incoming))).toEqual(incoming);
  });
  it.each(['null', '{}', '{bad', '{"format":"focus-full","version":1,"entries":{}}'])(
    'rejects malformed or different formats without exposing content %s',
    (raw) => {
      expect(() => parsePersonalPlan(raw)).toThrow('Plano inválido');
    },
  );
  it('rejects oversize files and excessive record counts before schema collision scans', () => {
    expect(() => parsePersonalPlan(' '.repeat(PERSONAL_PLAN_LIMIT + 1))).toThrow('5 MB');
    expect(() =>
      parsePersonalPlan(
        JSON.stringify({
          ...emptyLifePlanning(),
          blocks: Array.from({ length: 1001 }, (_, i) => block(String(i))),
        }),
      ),
    ).toThrow();
  });
  it('rejects duplicate IDs, invalid references, internal collisions, overnight times and unexpected fields', () => {
    const d = plan();
    for (const bad of [
      { ...d, areas: [d.areas[0], d.areas[0]] },
      { ...d, goals: [{ ...d.goals[0], areaId: 'missing' }] },
      { ...d, blocks: [block('a'), block('b')] },
      { ...d, blocks: [block('b', { start: '23:00', end: '01:00' })] },
      { ...d, blocks: [{ ...block('b'), description: 42 }] },
      { ...d, version: 2 },
      { ...d, unexpected: true },
    ])
      expect(() => parsePersonalPlan(JSON.stringify(bad))).toThrow('Plano inválido');
  });
});
describe('additive merge', () => {
  it('previews new records without mutating either input and is idempotent when repeated', () => {
    const current = emptyLifePlanning();
    const incoming = plan();
    const original = JSON.stringify(incoming);
    const first = previewPersonalPlan(current, incoming, emptyImportOptions());
    expect(first.issues).toEqual([]);
    expect(first.entries.map((e) => e.outcome)).toEqual(['new', 'new', 'new']);
    expect(current).toEqual(emptyLifePlanning());
    expect(JSON.stringify(incoming)).toBe(original);
    const repeated = previewPersonalPlan(first.data, incoming, emptyImportOptions());
    expect(repeated.changed).toBe(false);
    expect(repeated.entries.every((e) => e.outcome === 'identical')).toBe(true);
  });
  it('requires decisions for differing IDs and applies keep/update only when chosen', () => {
    const current = plan();
    const incoming = plan();
    incoming.areas[0]!.name = 'Nova área de exemplo';
    incoming.goals[0]!.description = 'Outra descrição de exemplo';
    const options = emptyImportOptions();
    expect(
      previewPersonalPlan(current, incoming, options).entries.filter(
        (e) => e.outcome === 'conflict',
      ),
    ).toHaveLength(2);
    options.choices[importKey('areas', 'a')] = 'keep';
    options.choices[importKey('goals', 'g')] = 'update';
    const result = previewPersonalPlan(current, incoming, options);
    expect(result.issues).toEqual([]);
    expect(result.data.areas).toEqual(current.areas);
    expect(result.data.goals).toEqual(incoming.goals);
  });
  it('duplicates and remaps area, goal, milestone and block IDs, preserving old records on repeat', () => {
    const current = plan();
    current.areas[0]!.name = 'Área anterior';
    current.goals[0]!.description = 'Descrição anterior';
    current.blocks[0] = block('b', { kind: 'flexible', start: '', end: '', goalId: 'g' });
    const incoming = plan();
    const options = emptyImportOptions();
    for (const kind of ['areas', 'goals', 'blocks'] as const)
      options.choices[importKey(kind, { areas: 'a', goals: 'g', blocks: 'b' }[kind])] = 'duplicate';
    const first = previewPersonalPlan(current, incoming, options);
    expect(first.issues).toEqual([]);
    validateLifePlanning(first.data);
    const area = first.data.areas.find((a) => a.id !== 'a')!;
    const goal = first.data.goals.find((g) => g.id !== 'g')!;
    const copied = first.data.blocks.find((b) => b.id !== 'b')!;
    expect(goal.areaId).toBe(area.id);
    expect(copied.goalId).toBe(goal.id);
    expect(goal.milestones[0]!.id).not.toBe('m');
    expect(goal.taskIds).toEqual(['existing-task']);
    expect(first.data.goals.find((g) => g.id === 'g')).toEqual(current.goals[0]);
    const again = previewPersonalPlan(first.data, incoming, options);
    expect(again.changed).toBe(false);
    expect(again.data).toEqual(first.data);
  });
  it('does not allocate duplicate IDs reserved by later incoming records', () => {
    const current = plan();
    current.areas[0]!.name = 'Nome anterior';
    const incoming = plan();
    incoming.areas.push({ id: 'a~import-1', name: 'Outra área' });
    const options = emptyImportOptions();
    options.choices['areas:a'] = 'duplicate';
    options.choices['goals:g'] = 'update';
    const result = previewPersonalPlan(current, incoming, options);
    expect(result.data.areas.find((a) => a.id === 'a~import-1')!.name).toBe('Outra área');
    expect(result.data.goals[0]!.areaId).toBe('a~import-2');
  });
  it('keeps distinct long source IDs separate when allocating duplicates with the same content', () => {
    const first = 'a'.repeat(190) + '1';
    const second = 'a'.repeat(190) + '2';
    const current = {
      ...emptyLifePlanning(),
      areas: [
        { id: first, name: 'Anterior' },
        { id: second, name: 'Anterior' },
      ],
    };
    const incoming = {
      ...emptyLifePlanning(),
      areas: [
        { id: first, name: 'Novo' },
        { id: second, name: 'Novo' },
      ],
    };
    const options = emptyImportOptions();
    options.choices[importKey('areas', first)] = 'duplicate';
    options.choices[importKey('areas', second)] = 'duplicate';
    const result = previewPersonalPlan(current, incoming, options);
    expect(result.data.areas).toHaveLength(4);
    expect(previewPersonalPlan(result.data, incoming, options).changed).toBe(false);
  });
  it('finds collisions with existing data and permits manual adjustment or skipping', () => {
    const current = { ...emptyLifePlanning(), blocks: [block('existing')] };
    const incoming = plan();
    const options = emptyImportOptions();
    expect(previewPersonalPlan(current, incoming, options).collisions).toHaveLength(1);
    options.adjustments['blocks:b'] = {
      date: '2026-11-11',
      kind: 'fixed',
      start: '11:00',
      end: '12:00',
    };
    const adjusted = previewPersonalPlan(current, incoming, options);
    expect(adjusted.issues).toEqual([]);
    expect(adjusted.data.blocks[0]).toEqual(current.blocks[0]);
    options.adjustments['blocks:b']!.end = '10:00';
    expect(previewPersonalPlan(current, incoming, options).issues.length).toBeGreaterThan(0);
    options.choices['blocks:b'] = 'skip';
    const skipped = previewPersonalPlan(current, incoming, options);
    expect(skipped.issues).toEqual([]);
    expect(skipped.data.blocks).toEqual(current.blocks);
  });
  it('requires an explicit timezone decision without shifting civil dates or times', () => {
    const incoming = plan();
    incoming.timezone = 'Asia/Tokyo';
    const options = emptyImportOptions();
    expect(previewPersonalPlan(emptyLifePlanning(), incoming, options).issues.join()).toContain(
      'fuso',
    );
    options.timezone = 'keep';
    expect(previewPersonalPlan(emptyLifePlanning(), incoming, options).data.timezone).toBe(
      'America/Fortaleza',
    );
    options.timezone = 'incoming';
    const result = previewPersonalPlan(emptyLifePlanning(), incoming, options);
    expect(result.data.timezone).toBe('Asia/Tokyo');
    expect(result.data.blocks).toEqual(incoming.blocks);
  });
});
describe('single coherent commit and recovery', () => {
  it('requires confirmation, writes exactly one planning key and preserves all legacy bytes', () => {
    const tasks = useTasks();
    tasks.data.categories.push({ id: 'example', name: 'Exemplo', color: '#112233' });
    localStorage.setItem('focus.routine.v1', 'untouched-example');
    localStorage.setItem('focus.habits.v1', 'untouched-example');
    const previous = Object.fromEntries(
      ['focus.v1', 'focus.routine.v1', 'focus.habits.v1'].map((k) => [k, localStorage.getItem(k)]),
    );
    const store = useLifePlanning();
    const expected = JSON.parse(JSON.stringify(store.data));
    const options = emptyImportOptions();
    const write = vi.spyOn(Storage.prototype, 'setItem');
    expect(store.importPlan(plan(), options, expected, false)).toBe(false);
    expect(write).not.toHaveBeenCalled();
    expect(store.importPlan(plan(), options, expected, true)).toBe(true);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0]![0]).toBe(LIFE_PLANNING_KEY);
    for (const [k, v] of Object.entries(previous)) expect(localStorage.getItem(k)).toBe(v);
    expect(store.importPlan(plan(), options, JSON.parse(JSON.stringify(store.data)), true)).toBe(
      true,
    );
    expect(write).toHaveBeenCalledTimes(1);
    setActivePinia(createPinia());
    expect(samePlan(useLifePlanning().data, plan())).toBe(true);
  });
  it('preserves original memory and storage on quota failure, then supports retry', () => {
    const store = useLifePlanning();
    store.saveArea({ id: 'existing', name: 'Área existente' });
    const before = JSON.parse(JSON.stringify(store.data));
    const raw = localStorage.getItem(LIFE_PLANNING_KEY);
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    expect(store.importPlan(plan(), emptyImportOptions(), before, true)).toBe(false);
    expect(store.data).toEqual(before);
    expect(localStorage.getItem(LIFE_PLANNING_KEY)).toBe(raw);
    spy.mockRestore();
    expect(store.importPlan(plan(), emptyImportOptions(), before, true)).toBe(true);
  });
  it('rejects stale previews, unresolved conflicts and external tab changes', () => {
    const store = useLifePlanning();
    const base = emptyLifePlanning();
    store.saveArea({ id: 'a', name: 'Outro nome' });
    expect(store.importPlan(plan(), emptyImportOptions(), base, true)).toBe(false);
    expect(
      store.importPlan(plan(), emptyImportOptions(), JSON.parse(JSON.stringify(store.data)), true),
    ).toBe(false);
    const before = JSON.parse(JSON.stringify(store.data));
    localStorage.setItem(LIFE_PLANNING_KEY, JSON.stringify(emptyLifePlanning()));
    const options = emptyImportOptions();
    options.choices['areas:a'] = 'keep';
    expect(store.importPlan(plan(), options, before, true)).toBe(false);
    expect(store.data).toEqual(before);
    expect(localStorage.getItem(LIFE_PLANNING_KEY)).toBe(JSON.stringify(emptyLifePlanning()));
  });
});
