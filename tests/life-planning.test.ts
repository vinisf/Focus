// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useLifePlanning } from '../src/stores/lifePlanning';
import { useTasks } from '../src/stores/tasks';
import {
  blocksCollide,
  emptyLifePlanning,
  goalProgress,
  LIFE_PLANNING_KEY,
  LifePlanningRepository,
  planningToday,
  validateLifePlanning,
  weekDays,
} from '../src/services/lifePlanningRepository';
import type { Goal, WeeklyBlock } from '../src/types/lifePlanning';

const goal = (): Goal => ({
  id: 'goal',
  areaId: 'area',
  title: 'Objetivo de exemplo',
  description: '',
  horizon: 'short',
  dueDate: '',
  status: 'active',
  milestones: [],
  taskIds: [],
});
const block = (id = 'block', fields: Partial<WeeklyBlock> = {}): WeeklyBlock => ({
  id,
  title: 'Bloco de exemplo',
  date: '2026-11-11',
  kind: 'fixed',
  start: '10:00',
  end: '11:00',
  status: 'planned',
  goalId: '',
  ...fields,
});
beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
});
afterEach(() => vi.restoreAllMocks());

describe('life planning domain', () => {
  it('uses only completed milestones for progress and no invented percentage', () => {
    const g = goal();
    g.status = 'done';
    expect(goalProgress(g)).toBeNull();
    g.milestones = [
      { id: '1', title: 'Entrega A', done: true },
      { id: '2', title: 'Entrega B', done: false },
    ];
    expect(goalProgress(g)).toBe(50);
    g.milestones[1]!.done = true;
    expect(goalProgress(g)).toBe(100);
  });
  it('builds Monday–Sunday across month, year and leap day boundaries', () => {
    expect(weekDays('2027-01-03')).toEqual([
      '2026-12-28',
      '2026-12-29',
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
      '2027-01-03',
    ]);
    expect(weekDays('2024-02-29')).toContain('2024-03-03');
    expect(weekDays('')).toEqual([]);
  });
  it('uses the chosen timezone at midnight without shifting civil dates', () => {
    const instant = new Date('2026-11-12T01:30:00Z');
    expect(planningToday('America/Fortaleza', instant)).toBe('2026-11-11');
    expect(planningToday('Asia/Tokyo', instant)).toBe('2026-11-12');
    const d = emptyLifePlanning();
    d.blocks = [block()];
    validateLifePlanning(d);
    d.timezone = 'Asia/Tokyo';
    validateLifePlanning(d);
    expect(d.blocks[0]!.date).toBe('2026-11-11');
  });
  it('rejects overlapping times, permits adjacent times and ignores unscheduled or cancelled blocks', () => {
    expect(blocksCollide(block(), block('b', { start: '10:30', end: '12:00' }))).toBe(true);
    expect(blocksCollide(block(), block('b', { start: '11:00', end: '12:00' }))).toBe(false);
    expect(blocksCollide(block(), block('b', { status: 'cancelled' }))).toBe(false);
    expect(blocksCollide(block(), block('b', { date: '2026-11-12' }))).toBe(false);
    expect(blocksCollide(block(), block('b', { kind: 'flexible', start: '', end: '' }))).toBe(
      false,
    );
  });
  it.each([
    { date: '2026-02-30' },
    { date: '2026-2-01' },
    { start: '24:00' },
    { end: '09:00' },
    { end: '10:00' },
    { start: '' },
    { start: '', end: '' },
    { goalId: 'missing' },
  ])('rejects invalid date, interval or link %o', (fields) => {
    expect(() =>
      validateLifePlanning({ ...emptyLifePlanning(), blocks: [block('a', fields)] }),
    ).toThrow();
  });
  it('strictly validates version, fields, identifiers and references', () => {
    expect(() => validateLifePlanning({ ...emptyLifePlanning(), version: 2 })).toThrow();
    expect(() => validateLifePlanning({ ...emptyLifePlanning(), timezone: 'invalid' })).toThrow();
    expect(() => validateLifePlanning({ ...emptyLifePlanning(), extra: true })).toThrow();
    expect(() => validateLifePlanning({ ...emptyLifePlanning(), goals: [goal()] })).toThrow();
    expect(() =>
      validateLifePlanning({
        ...emptyLifePlanning(),
        areas: [
          { id: 'a', name: 'A' },
          { id: 'a', name: 'B' },
        ],
      }),
    ).toThrow();
  });
});

describe('safe independent persistence', () => {
  it('persists CRUD and task links after reload without changing legacy task/category bytes', () => {
    const tasks = useTasks();
    tasks.data.categories.push({ id: 'custom', name: 'Categoria de exemplo', color: '#112233' });
    const legacy = localStorage.getItem('focus.v1');
    const store = useLifePlanning();
    expect(store.saveArea({ id: 'area', name: 'Área de exemplo' })).toBe(true);
    const g = goal();
    g.taskIds = ['existing-task'];
    expect(store.saveGoal(g)).toBe(true);
    expect(store.saveBlock(block('b', { goalId: g.id }))).toBe(true);
    expect(store.removeArea('area')).toBe(false);
    expect(store.saveGoal({ ...g, title: 'Título editado' })).toBe(true);
    setActivePinia(createPinia());
    const loaded = useLifePlanning();
    expect(loaded.data.goals[0]!.title).toBe('Título editado');
    expect(loaded.data.goals[0]!.taskIds).toEqual(['existing-task']);
    expect(loaded.saveBlock(block('b', { date: '2026-11-12', goalId: g.id }))).toBe(true);
    expect(loaded.removeGoal(g.id)).toBe(true);
    expect(loaded.data.blocks[0]!.goalId).toBe('');
    expect(loaded.removeArea('area')).toBe(true);
    expect(loaded.removeBlock('b')).toBe(true);
    expect(localStorage.getItem('focus.v1')).toBe(legacy);
    expect(useTasks().data.categories).toEqual(tasks.data.categories);
  });
  it('does not publish unsaved changes on quota failure', () => {
    const store = useLifePlanning();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota', 'QuotaExceededError');
    });
    expect(store.saveArea({ id: 'area', name: 'Área' })).toBe(false);
    expect(store.data.areas).toEqual([]);
    expect(store.error).toBeTruthy();
  });
  it.each(['{bad', 'null', '{"version":99}'])(
    'preserves invalid saved bytes %s and blocks writes',
    (raw) => {
      localStorage.setItem(LIFE_PLANNING_KEY, raw);
      const store = useLifePlanning();
      expect(store.blocked).toBe(true);
      expect(store.saveArea({ id: 'a', name: 'Área' })).toBe(false);
      expect(localStorage.getItem(LIFE_PLANNING_KEY)).toBe(raw);
    },
  );
  it('handles denied storage reads', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw Error('denied');
    });
    const store = useLifePlanning();
    expect(store.blocked).toBe(true);
    expect(store.saveGoal(goal())).toBe(false);
  });
  it('refuses to overwrite a newer save from another tab', () => {
    const a = new LifePlanningRepository();
    const b = new LifePlanningRepository();
    a.load();
    b.load();
    a.save({ ...emptyLifePlanning(), areas: [{ id: 'a', name: 'Área A' }] });
    expect(() => b.save(emptyLifePlanning())).toThrow('outra aba');
    expect(new LifePlanningRepository().load().areas[0]!.id).toBe('a');
  });
  it('rejects collisions without changing existing blocks and allows cancellation to free time', () => {
    const store = useLifePlanning();
    expect(store.saveBlock(block())).toBe(true);
    expect(store.saveBlock(block('b'))).toBe(false);
    expect(store.data.blocks).toHaveLength(1);
    expect(store.saveBlock(block('block', { status: 'cancelled' }))).toBe(true);
    expect(store.saveBlock(block('b'))).toBe(true);
  });
});
