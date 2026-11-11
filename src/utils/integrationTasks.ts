import type { Task } from '../types';
import { dateKey } from './dates';

/** Daily suggestions are optional: completed and declined integrations both consume a slot. */
export function integrationTasksForDay(tasks: Task[], now: Date, limit: 1 | 2 = 2): Task[] {
  const today = dateKey(now);
  const used = tasks.filter(
    (t) =>
      t.integrationName &&
      ((t.status === 'done' && t.completedAt && dateKey(new Date(t.completedAt)) === today) ||
        t.integrationDeferredOn === today),
  ).length;
  return tasks
    .filter(
      (t) =>
        t.integrationName &&
        !t.blocked &&
        ['pending', 'active'].includes(t.status) &&
        t.integrationDeferredOn !== today &&
        (!t.plannedDate || t.plannedDate <= today),
    )
    .sort(
      (a, b) =>
        (a.status === 'active' ? 0 : 1) - (b.status === 'active' ? 0 : 1) ||
        a.createdAt.localeCompare(b.createdAt) ||
        a.id.localeCompare(b.id),
    )
    .slice(0, Math.max(0, limit - used));
}
