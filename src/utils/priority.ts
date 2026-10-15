import type { Task } from '../types';
import { dateKey } from './dates';
export const defaultWeights = {
  priority: 18,
  importance: 22,
  overdue: 36,
  today: 28,
  soon: 14,
  ageCap: 8,
  fits: 6,
};
export function rank(task: Task, minutes: number, now = new Date(), w = defaultWeights) {
  const p = { low: 0, medium: 1, high: 2, urgent: 4 }[task.priority];
  const importance = { low: 0, medium: 1, high: 2 }[task.importance];
  const today = dateKey(now);
  const distance = task.dueDate
    ? (new Date(task.dueDate + 'T12:00:00').getTime() - new Date(today + 'T12:00:00').getTime()) /
      86400000
    : Infinity;
  const age = Math.min(
    w.ageCap,
    Math.max(0, Math.floor((now.getTime() - Date.parse(task.createdAt)) / 86400000)),
  );
  const score =
    p * w.priority +
    importance * w.importance +
    (distance < 0 ? w.overdue : distance === 0 ? w.today : distance <= 3 ? w.soon : 0) +
    age +
    (task.duration <= minutes ? w.fits : 0);
  const reasons = [
    task.priority === 'urgent'
      ? 'tem prioridade urgente'
      : task.importance === 'high'
        ? 'é importante para você'
        : 'ajuda a avançar no seu planejamento',
    distance < 0
      ? 'está com o prazo vencido'
      : distance === 0
        ? 'vence hoje'
        : !task.dueDate
          ? 'merece atenção mesmo sem prazo'
          : 'tem um prazo definido',
    `cabe nos seus ${minutes} minutos`,
  ];
  return { task, score, reason: `Esta tarefa ${reasons.join(', ')}.` };
}
export function recommend(tasks: Task[], minutes: number, now = new Date()) {
  return tasks
    .filter((t) => (t.status === 'pending' || t.status === 'active') && t.duration <= minutes)
    .map((t) => rank(t, minutes, now))
    .sort((a, b) => b.score - a.score || a.task.id.localeCompare(b.task.id))
    .slice(0, 3);
}
