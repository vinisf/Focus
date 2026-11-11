import type { Goal, LifePlanningData, WeeklyBlock } from '../types/lifePlanning';
import { validLocalDate } from './habitRepository';
import { addDays } from '../utils/dates';

export const LIFE_PLANNING_KEY = 'focus.life-planning.v1';
export const emptyLifePlanning = (): LifePlanningData => ({
  version: 1,
  timezone: 'America/Fortaleza',
  areas: [],
  goals: [],
  blocks: [],
});
const text = (v: unknown): v is string => typeof v === 'string' && v.length <= 10000;
const name = (v: unknown): v is string => text(v) && !!v.trim() && v.length <= 200;
const time = (v: unknown): v is string =>
  typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const unique = (ids: string[]) => new Set(ids).size === ids.length;
const fields = (value: object, expected: string[]) =>
  Object.keys(value).sort().join() === expected.sort().join();
export function validTimezone(value: string) {
  try {
    new Intl.DateTimeFormat('pt-BR', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
export function goalProgress(goal: {
  readonly milestones: readonly Goal['milestones'][number][];
}): number | null {
  return goal.milestones.length
    ? Math.round((100 * goal.milestones.filter((m) => m.done).length) / goal.milestones.length)
    : null;
}
export function weekDays(date: string): string[] {
  if (!validLocalDate(date)) return [];
  const day = new Date(date + 'T12:00:00').getDay();
  const monday = addDays(date, -((day + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}
export function planningToday(timezone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function blocksCollide(a: WeeklyBlock, b: WeeklyBlock): boolean {
  return (
    a.id !== b.id &&
    a.status !== 'cancelled' &&
    b.status !== 'cancelled' &&
    a.date === b.date &&
    !!a.start &&
    !!b.start &&
    a.start < b.end &&
    b.start < a.end
  );
}
export function validateLifePlanning(value: unknown): asserts value is LifePlanningData {
  const d = value as LifePlanningData;
  if (
    !d ||
    !fields(d, ['version', 'timezone', 'areas', 'goals', 'blocks']) ||
    d.version !== 1 ||
    !name(d.timezone) ||
    !validTimezone(d.timezone) ||
    !Array.isArray(d.areas) ||
    !Array.isArray(d.goals) ||
    !Array.isArray(d.blocks) ||
    d.areas.some((a) => !a || !fields(a, ['id', 'name']) || !name(a.id) || !name(a.name)) ||
    !unique(d.areas.map((a) => a.id)) ||
    d.goals.some(
      (g) =>
        !g ||
        !fields(g, [
          'id',
          'areaId',
          'title',
          'description',
          'horizon',
          'dueDate',
          'status',
          'milestones',
          'taskIds',
        ]) ||
        !name(g.id) ||
        !name(g.title) ||
        !text(g.description) ||
        !d.areas.some((a) => a.id === g.areaId) ||
        !['short', 'medium', 'long'].includes(g.horizon) ||
        !(g.dueDate === '' || validLocalDate(g.dueDate)) ||
        !['active', 'paused', 'done', 'cancelled'].includes(g.status) ||
        !Array.isArray(g.milestones) ||
        g.milestones.some(
          (m) =>
            !m ||
            !fields(m, ['id', 'title', 'done']) ||
            !name(m.id) ||
            !name(m.title) ||
            typeof m.done !== 'boolean',
        ) ||
        !unique(g.milestones.map((m) => m.id)) ||
        !Array.isArray(g.taskIds) ||
        !g.taskIds.every(name) ||
        !unique(g.taskIds),
    ) ||
    !unique(d.goals.map((g) => g.id)) ||
    d.blocks.some(
      (b) =>
        !b ||
        !fields(b, [
          'id',
          'title',
          'date',
          'kind',
          'start',
          'end',
          'status',
          'goalId',
          ...(b.description === undefined ? [] : ['description']),
        ]) ||
        (b.description !== undefined && !text(b.description)) ||
        !name(b.id) ||
        !name(b.title) ||
        !validLocalDate(b.date) ||
        !['fixed', 'flexible'].includes(b.kind) ||
        !['planned', 'cancelled'].includes(b.status) ||
        !(b.goalId === '' || d.goals.some((g) => g.id === b.goalId)) ||
        !(
          (b.kind === 'flexible' && b.start === '' && b.end === '') ||
          (time(b.start) && time(b.end) && b.start < b.end)
        ),
    ) ||
    !unique(d.blocks.map((b) => b.id)) ||
    d.blocks.some((b, i) => d.blocks.slice(i + 1).some((other) => blocksCollide(b, other)))
  )
    throw new Error(
      'Confira os dados, vínculos e horários. Há campos inválidos ou horários em conflito.',
    );
}
export class LifePlanningRepository {
  private snapshot: string | null | undefined;
  constructor(private storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage) {}
  load(): LifePlanningData {
    const raw = this.storage.getItem(LIFE_PLANNING_KEY);
    this.snapshot = raw;
    if (raw === null) return emptyLifePlanning();
    const data: unknown = JSON.parse(raw);
    validateLifePlanning(data);
    return data;
  }
  save(data: LifePlanningData) {
    validateLifePlanning(data);
    if (this.snapshot === undefined || this.storage.getItem(LIFE_PLANNING_KEY) !== this.snapshot)
      throw new Error('Os dados mudaram em outra aba. Recarregue antes de salvar.');
    const raw = JSON.stringify(data);
    this.storage.setItem(LIFE_PLANNING_KEY, raw);
    this.snapshot = raw;
  }
}
