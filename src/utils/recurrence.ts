import type { Task } from '../types';
import { addDays, dateKey } from './dates';
export function nextOccurrence(task: Task, now = new Date()): Task | null {
  if (!task.recurrence || task.nextId) return null;
  const base = [task.dueDate, task.plannedDate, dateKey(now)].filter(Boolean).sort().at(-1)!;
  let next = addDays(base, task.recurrence.kind === 'weekly' ? 7 : 1);
  if (task.recurrence.kind === 'custom') {
    if (!task.recurrence.days.length) return null;
    for (let i = 0; i < 7; i++) {
      if (task.recurrence.days.includes(new Date(next + 'T12:00:00').getDay())) break;
      next = addDays(next, 1);
    }
  }
  return {
    ...task,
    id: crypto.randomUUID(),
    status: 'pending',
    createdAt: now.toISOString(),
    completedAt: null,
    nextId: undefined,
    dueDate: task.dueDate ? next : '',
    plannedDate: next,
  };
}
