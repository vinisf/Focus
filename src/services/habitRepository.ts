import {
  habitIcons,
  type Habit,
  type HabitData,
  type HabitFrequency,
  type HabitGoal,
} from '../types/habits';
import { dateKey } from '../utils/dates';

export const HABITS_KEY = 'focus.habits.v1';
export function validLocalDate(v: unknown): v is string {
  return (
    typeof v === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    dateKey(new Date(v + 'T12:00:00')) === v
  );
}
const validTimestamp = (v: unknown): v is string => typeof v === 'string' && !isNaN(Date.parse(v));
const validId = (v: unknown): v is string => typeof v === 'string' && !!v.trim();
export function validGoal(goal: HabitGoal | undefined): boolean {
  return (
    goal === undefined ||
    (!!goal &&
      typeof goal.description === 'string' &&
      (goal.kind === 'check' ||
        (goal.kind === 'quantity' &&
          Number.isFinite(goal.target) &&
          goal.target > 0 &&
          goal.target <= 1e9 &&
          typeof goal.unit === 'string' &&
          !!goal.unit.trim())))
  );
}
export function validFrequency(f: HabitFrequency): boolean {
  return (
    !!f &&
    (f.kind === 'daily' ||
      (f.kind === 'weekly' && Number.isInteger(f.target) && f.target >= 1 && f.target <= 7) ||
      (f.kind === 'weekdays' &&
        Array.isArray(f.days) &&
        f.days.length > 0 &&
        new Set(f.days).size === f.days.length &&
        f.days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)))
  );
}
export function validHabit(h: Habit): boolean {
  return (
    !!h &&
    validId(h.id) &&
    (h.duration === undefined ||
      (Number.isFinite(h.duration) && h.duration > 0 && h.duration <= 10080)) &&
    (h.intensity === undefined || ['light', 'moderate', 'high'].includes(h.intensity)) &&
    (h.effort === undefined || ['physical', 'mental', 'other'].includes(h.effort)) &&
    (h.minIntervalHours === undefined ||
      (Number.isFinite(h.minIntervalHours) &&
        h.minIntervalHours >= 0 &&
        h.minIntervalHours <= 8760)) &&
    (h.allowMultipleSessions === undefined || typeof h.allowMultipleSessions === 'boolean') &&
    typeof h.name === 'string' &&
    !!h.name.trim() &&
    validGoal(h.goal) &&
    typeof h.description === 'string' &&
    (h.categoryId === null || validId(h.categoryId)) &&
    habitIcons.includes(h.icon) &&
    validFrequency(h.frequency) &&
    typeof h.preferredTime === 'string' &&
    (!h.preferredTime || /^([01]\d|2[0-3]):[0-5]\d$/.test(h.preferredTime)) &&
    validTimestamp(h.createdAt) &&
    ['active', 'archived'].includes(h.status) &&
    Array.isArray(h.plans) &&
    h.plans.length > 0 &&
    h.plans.every(
      (p, i) =>
        p &&
        validLocalDate(p.from) &&
        p.from >= dateKey(new Date(h.createdAt)) &&
        validFrequency(p.frequency) &&
        validGoal(p.goal) &&
        typeof p.active === 'boolean' &&
        (i === 0 || p.from > h.plans[i - 1]!.from),
    ) &&
    h.plans[0]!.from === dateKey(new Date(h.createdAt)) &&
    h.plans.at(-1)!.active === (h.status === 'active') &&
    JSON.stringify(h.plans.at(-1)!.frequency) === JSON.stringify(h.frequency) &&
    JSON.stringify(h.plans.at(-1)!.goal) === JSON.stringify(h.goal)
  );
}
export interface HabitRepository {
  load(): HabitData | null;
  save(data: HabitData): void;
}
export class LocalHabitRepository implements HabitRepository {
  constructor(
    private storage: Pick<Storage, 'getItem' | 'setItem'> = {
      getItem: (key) => localStorage.getItem(key),
      setItem: (key, value) => localStorage.setItem(key, value),
    },
  ) {}
  load(): HabitData | null {
    const raw = this.storage.getItem(HABITS_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as HabitData;
    if (
      !data ||
      data.version !== 1 ||
      (data.sessions !== undefined &&
        (!Array.isArray(data.sessions) ||
          !data.sessions.every(
            (s) =>
              s && validTimestamp(s.completedAt) && data.habits?.some((h) => h.id === s.habitId),
          ))) ||
      !Array.isArray(data.habits) ||
      !data.habits.every(validHabit) ||
      new Set(data.habits.map((h) => h.id)).size !== data.habits.length ||
      !Array.isArray(data.completions) ||
      !data.completions.every(
        (c) =>
          c &&
          validId(c.id) &&
          validId(c.habitId) &&
          validLocalDate(c.date) &&
          validTimestamp(c.completedAt) &&
          validGoal(c.goal) &&
          (c.value === undefined || (Number.isFinite(c.value) && c.value >= 0 && c.value <= 1e9)) &&
          (c.goal?.kind !== 'quantity' || (c.value !== undefined && c.value >= c.goal.target)) &&
          data.habits.some((h) => h.id === c.habitId && c.date >= dateKey(new Date(h.createdAt))),
      ) ||
      new Set(data.completions.map((c) => c.id)).size !== data.completions.length ||
      new Set(data.completions.map((c) => `${c.habitId}:${c.date}`)).size !==
        data.completions.length ||
      (data.progress !== undefined &&
        (!Array.isArray(data.progress) ||
          !data.progress.every(
            (p) =>
              p &&
              validId(p.habitId) &&
              validLocalDate(p.date) &&
              Number.isFinite(p.value) &&
              p.value >= 0 &&
              p.value <= 1e9 &&
              validTimestamp(p.updatedAt) &&
              data.habits.some(
                (h) => h.id === p.habitId && p.date >= dateKey(new Date(h.createdAt)),
              ),
          ) ||
          new Set(data.progress.map((p) => `${p.habitId}:${p.date}`)).size !==
            data.progress.length))
    )
      throw new Error('Histórico de hábitos inválido. Os dados originais foram preservados.');
    return { ...data, progress: data.progress ?? [] };
  }
  save(data: HabitData) {
    this.storage.setItem(HABITS_KEY, JSON.stringify(data));
  }
}
