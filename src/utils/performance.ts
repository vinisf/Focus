import type { Task } from '../types';
import type { HabitData } from '../types/habits';
import type { WorkSession } from '../types/planning';
import { addDays, dateKey } from './dates';
import { habitCompliance, planOn, weekStart } from './habits';
import { compliance } from './metrics';

export type PerformancePeriod = 'today' | 'week' | 'month';
export type PerformanceTask = Pick<
  Task,
  'id' | 'plannedDate' | 'dueDate' | 'duration' | 'status' | 'createdAt' | 'completedAt'
>;
export function performanceTask(task: Task): PerformanceTask {
  const { id, plannedDate, dueDate, duration, status, createdAt, completedAt } = task;
  return { id, plannedDate, dueDate, duration, status, createdAt, completedAt };
}
export interface TaskSnapshot {
  at: string;
  tasks: PerformanceTask[];
}
export interface DateRange {
  start: string;
  end: string;
}

export function performanceRange(period: PerformancePeriod, today: string): DateRange {
  return {
    start:
      period === 'today' ? today : period === 'week' ? weekStart(today) : today.slice(0, 7) + '-01',
    end: today,
  };
}

/** Older records have no audit trail: retain the first observed baseline, rather
 * than rewriting old results when a task is subsequently edited or reopened. */
export function tasksAt(tasks: Task[], snapshots: TaskSnapshot[], day: string): PerformanceTask[] {
  const snapshot = snapshots.filter((s) => dateKey(new Date(s.at)) <= day).at(-1) ?? snapshots[0];
  return (snapshot?.tasks ?? tasks).filter((t) => dateKey(new Date(t.createdAt)) <= day);
}

export function periodProductivity(tasks: Task[], snapshots: TaskSnapshot[], range: DateRange) {
  const planned = new Map<string, PerformanceTask>();
  const done = new Set<string>();
  // Count each task once per reporting period, even after a replan.
  for (let day = range.start; day <= range.end; day = addDays(day, 1)) {
    for (const task of tasksAt(tasks, snapshots, day)) {
      // An explicit plan takes precedence over a deadline; they are not two assignments.
      if (task.status === 'cancelled' || (task.plannedDate || task.dueDate) !== day) continue;
      planned.set(task.id, task);
      if (task.status === 'done' && task.completedAt) {
        const completed = dateKey(new Date(task.completedAt));
        if (completed >= range.start && completed <= day) done.add(task.id);
      }
    }
  }
  // A late completion may fulfill a plan within the same week/month, but cannot
  // retroactively turn the earlier daily point into a success.
  for (const task of tasksAt(tasks, snapshots, range.end)) {
    if (!planned.has(task.id) || task.status !== 'done' || !task.completedAt) continue;
    const completed = dateKey(new Date(task.completedAt));
    if (completed >= range.start && completed <= range.end) done.add(task.id);
  }
  return compliance(done.size, planned.size);
}

export function completedInPeriod(tasks: Task[], snapshots: TaskSnapshot[], range: DateRange) {
  const completed = new Map<string, PerformanceTask>();
  for (let day = range.start; day <= range.end; day = addDays(day, 1)) {
    for (const task of tasksAt(tasks, snapshots, day)) {
      if (task.status !== 'done' || !task.completedAt) continue;
      const date = dateKey(new Date(task.completedAt));
      if (date >= range.start && date <= day) completed.set(task.id, task);
    }
  }
  return [...completed.values()];
}

export function periodConsistency(
  data: HabitData,
  range: DateRange,
  today: string,
  dailyFlexibleWeek = range.start === range.end,
) {
  const totals = data.habits.reduce(
    (sum, habit) => {
      const flexibleDay =
        dailyFlexibleWeek && planOn(habit, range.end)?.frequency.kind === 'weekly';
      const reportingHabit = flexibleDay
        ? {
            ...habit,
            plans: habit.plans.map((p) => ({
              ...p,
              active: p.active && p.frequency.kind === 'weekly',
            })),
          }
        : habit;
      const result = habitCompliance(
        reportingHabit,
        data.completions,
        flexibleDay ? weekStart(range.start) : range.start,
        flexibleDay ? addDays(weekStart(range.end), 6) : range.end,
        today,
      );
      return { done: sum.done + result.done, expected: sum.expected + result.expected };
    },
    { done: 0, expected: 0 },
  );
  return compliance(totals.done, totals.expected);
}

/** Only closed sessions are confirmed. Union intervals to avoid double counting
 * overlaps; clip by local boundaries and now, including midnight/DST changes. */
export function sessionMinutes(sessions: WorkSession[], range: DateRange, now: Date) {
  const start = new Date(range.start + 'T00:00:00').getTime();
  const end = Math.min(new Date(addDays(range.end, 1) + 'T00:00:00').getTime(), now.getTime());
  const intervals = sessions
    .flatMap((s) => {
      if (!s.endedAt) return [];
      const from = Math.max(start, Date.parse(s.startedAt));
      const to = Math.min(end, Date.parse(s.endedAt));
      return Number.isFinite(from) && Number.isFinite(to) && to > from ? [[from, to] as const] : [];
    })
    .sort((a, b) => a[0] - b[0]);
  let total = 0,
    previousEnd = start;
  for (const [from, to] of intervals) {
    total += Math.max(0, to - Math.max(from, previousEnd));
    previousEnd = Math.max(previousEnd, to);
  }
  return total / 60000;
}

export function formatDuration(minutes: number): string {
  const rounded = Math.max(0, Math.floor(minutes));
  const hours = Math.floor(rounded / 60),
    rest = rounded % 60;
  return hours ? `${hours} h${rest ? ` ${rest} min` : ''}` : `${rest} min`;
}

export function evolutionRanges(
  mode: 'days' | 'weeks' | 'months',
  today: string,
): (DateRange & { label: string })[] {
  if (mode === 'days')
    return Array.from({ length: 7 }, (_, i) => {
      const day = addDays(today, i - 6);
      return { start: day, end: day, label: day.slice(8) + '/' + day.slice(5, 7) };
    });
  if (mode === 'weeks') {
    const ranges = [];
    for (let start = today.slice(0, 7) + '-01'; start <= today;) {
      const end = [addDays(weekStart(start), 6), today].sort()[0]!;
      ranges.push({ start, end, label: `${Number(start.slice(8))}–${Number(end.slice(8))}` });
      start = addDays(end, 1);
    }
    return ranges;
  }
  return Array.from({ length: 12 }, (_, i) => {
    const date = new Date(today + 'T12:00:00');
    date.setDate(1);
    date.setMonth(date.getMonth() + i - 11);
    const start = dateKey(date);
    date.setMonth(date.getMonth() + 1);
    return {
      start,
      end: [addDays(dateKey(date), -1), today].sort()[0]!,
      label: start.slice(5, 7) + '/' + start.slice(2, 4),
    };
  });
}
