import type { Task } from '../types';
import { dateKey } from './dates';
import { compliance } from './metrics';

export function taskProductivity(tasks: Task[], today: string) {
  const planned = tasks.filter(
    (t) => t.status !== 'cancelled' && (t.plannedDate === today || t.dueDate === today),
  );
  const completed = planned.filter(
    (t) => t.status === 'done' && t.completedAt && dateKey(new Date(t.completedAt)) <= today,
  );
  return { ...compliance(completed.length, planned.length), planned };
}
