import type { ActivityRecommendation, RecommendationContext } from '../types/recommendations';
import type { ActivitySource } from '../types/planning';
import { dateKey } from './dates';

export interface NormalizedActivity {
  key: string;
  source: ActivitySource;
  title: string;
  duration: number | null;
  plannedDate: string | null;
  scheduledAt: number | null;
  deadlineAt: number | null;
  mandatory: boolean;
  priority: number;
  importance: number;
  nextAction: string;
}
export const atTime = (date: string, time: string) => new Date(`${date}T${time}:00`).getTime();
export function normalizeActivity(a: ActivityRecommendation): NormalizedActivity {
  const task = a.type === 'task' ? a.task : null;
  const platform = a.type === 'platform' ? a.platform : null;
  const deadline = task?.dueDate
    ? atTime(task.dueDate, task.deadlineTime || task.time || '23:59')
    : platform?.dueDate
      ? atTime(platform.dueDate, '23:59')
      : a.type === 'iema' && a.ticket.due_at
        ? Date.parse(a.ticket.due_at)
        : null;
  return {
    key: a.key,
    source: task?.integrationName ? 'platform' : a.type,
    title: a.title,
    duration: a.duration,
    plannedDate: task?.plannedDate || null,
    scheduledAt:
      task?.scheduledTime && (task.plannedDate || task.dueDate)
        ? atTime(task.plannedDate || task.dueDate, task.scheduledTime)
        : (a.plannedAt ?? null),
    deadlineAt: deadline !== null && Number.isFinite(deadline) ? deadline : null,
    mandatory: !!task?.mandatory,
    priority: { low: 0, medium: 1, high: 2, urgent: 3 }[
      task?.priority || platform?.priority || 'medium'
    ],
    importance: task ? { low: 0, medium: 1, high: 2 }[task.importance] : 0,
    nextAction:
      task?.nextAction ||
      platform?.nextAction ||
      (a.type === 'iema' ? 'Abrir chamado e avaliar o próximo passo' : a.title),
  };
}
export function criticalToken(a: ActivityRecommendation, c: RecommendationContext): string | null {
  const n = normalizeActivity(a);
  const imminent =
    n.mandatory &&
    n.scheduledAt !== null &&
    n.scheduledAt <= c.now.getTime() + (c.imminentMinutes ?? 15) * 60000 &&
    dateKey(new Date(n.scheduledAt)) === dateKey(c.now);
  const due = n.deadlineAt !== null && n.deadlineAt <= atTime(dateKey(c.now), '23:59');
  const urgent = n.priority === 3;
  if (!imminent && !due && !urgent) return null;
  return `${due ? n.deadlineAt : ''}:${imminent ? n.scheduledAt : ''}:${urgent ? 'urgent' : ''}`;
}
export function temporalLimit(a: ActivityRecommendation, c: RecommendationContext): number {
  const n = normalizeActivity(a);
  const values = [n.deadlineAt];
  if (
    n.mandatory &&
    n.scheduledAt !== null &&
    n.scheduledAt <= c.now.getTime() + (c.imminentMinutes ?? 15) * 60000
  )
    values.push(n.scheduledAt);
  return Math.min(...values.filter((v): v is number => v !== null));
}
export function availableMinutes(c: RecommendationContext, ownKey?: string): number {
  if (c.ignoreTimeConstraints) return c.minutes;
  const now = c.now.getTime(),
    today = dateKey(c.now);
  const boundaries: number[] = [];
  if (c.freeUntil) boundaries.push(atTime(today, c.freeUntil));
  for (const t of c.tasks) {
    if (
      `task:${t.id}` === ownKey ||
      !['pending', 'active'].includes(t.status) ||
      !t.mandatory ||
      !t.scheduledTime
    )
      continue;
    const date = t.plannedDate || t.dueDate;
    if (date !== today) continue;
    const start = atTime(date, t.scheduledTime),
      end = start + t.duration * 60000;
    if (start > now) boundaries.push(start);
    else if (end > now) boundaries.push(now);
  }
  for (const interval of c.unavailable ?? []) {
    const start = atTime(today, interval.start),
      end = atTime(today, interval.end);
    if (end > now) boundaries.push(Math.max(now, start));
  }
  return Math.max(0, Math.min(c.minutes, ...boundaries.map((t) => (t - now) / 60000)));
}
