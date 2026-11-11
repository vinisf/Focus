import type { Data, Task } from '../types';
import { dateKey } from '../utils/dates';
const KEY = 'focus.v1';
const validDate = (v: unknown) =>
  typeof v === 'string' &&
  (v === '' || (/^\d{4}-\d{2}-\d{2}$/.test(v) && dateKey(new Date(v + 'T12:00:00')) === v));
export function validTask(t: Task): boolean {
  return (
    !!t &&
    typeof t.id === 'string' &&
    typeof t.title === 'string' &&
    !!t.title.trim() &&
    typeof t.description === 'string' &&
    typeof t.categoryId === 'string' &&
    validDate(t.dueDate) &&
    validDate(t.plannedDate) &&
    typeof t.time === 'string' &&
    (!t.time || /^([01]\d|2[0-3]):[0-5]\d$/.test(t.time)) &&
    [t.scheduledTime, t.deadlineTime].every(
      (v) => v === undefined || v === '' || /^([01]\d|2[0-3]):[0-5]\d$/.test(v),
    ) &&
    (t.mandatory === undefined || typeof t.mandatory === 'boolean') &&
    (t.mandatory !== true || (!!t.scheduledTime && !!(t.plannedDate || t.dueDate))) &&
    (t.blocked === undefined || typeof t.blocked === 'boolean') &&
    (t.nextAction === undefined || typeof t.nextAction === 'string') &&
    ['low', 'medium', 'high', 'urgent'].includes(t.priority) &&
    ['low', 'medium', 'high'].includes(t.importance) &&
    ['pending', 'active', 'done', 'cancelled'].includes(t.status) &&
    Number.isFinite(t.duration) &&
    t.duration > 0 &&
    typeof t.createdAt === 'string' &&
    !isNaN(Date.parse(t.createdAt)) &&
    (t.completedAt === null ||
      (typeof t.completedAt === 'string' && !isNaN(Date.parse(t.completedAt)))) &&
    (t.nextId === undefined || typeof t.nextId === 'string') &&
    (t.integrationName === undefined ||
      (typeof t.integrationName === 'string' && !!t.integrationName.trim())) &&
    (t.integrationDeferredOn === undefined || validDate(t.integrationDeferredOn)) &&
    (t.recurrence === null ||
      (['daily', 'weekly', 'custom'].includes(t.recurrence?.kind) &&
        Array.isArray(t.recurrence.days) &&
        t.recurrence.days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6) &&
        (t.recurrence.kind !== 'custom' || t.recurrence.days.length > 0)))
  );
}
export interface Repository {
  load(): Data | null;
  save(data: Data): void;
}
export class LocalRepository implements Repository {
  constructor(private storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage) {}
  load(): Data | null {
    const raw = this.storage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Data;
    if (
      d.version !== 1 ||
      (d.integrationDailyLimit !== undefined && ![1, 2].includes(d.integrationDailyLimit)) ||
      !Array.isArray(d.tasks) ||
      !d.tasks.every(validTask) ||
      !Array.isArray(d.categories) ||
      !d.categories.every(
        (c) =>
          c &&
          typeof c.id === 'string' &&
          typeof c.name === 'string' &&
          !!c.name.trim() &&
          /^#[0-9a-f]{6}$/i.test(c.color),
      ) ||
      new Set(d.tasks.map((t) => t.id)).size !== d.tasks.length ||
      new Set(d.categories.map((c) => c.id)).size !== d.categories.length ||
      d.tasks.some((t) => !d.categories.some((c) => c.id === t.categoryId))
    )
      throw new Error('Dados salvos inválidos. O conteúdo original foi preservado.');
    return d;
  }
  save(data: Data) {
    this.storage.setItem(KEY, JSON.stringify(data));
  }
}
