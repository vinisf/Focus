import type { Habit, HabitCompletion, HabitFrequency } from '../types/habits';
import { addDays, dateKey } from './dates';
import { compliance, type Compliance } from './metrics';

export function weekStart(date: string): string {
  return addDays(date, -((new Date(date + 'T12:00:00').getDay() + 6) % 7));
}

export function datesBetween(start: string, end: string): string[] {
  const dates: string[] = [];
  for (let date = start; date <= end; date = addDays(date, 1)) dates.push(date);
  return dates;
}

export function planOn(habit: Habit, date: string) {
  return habit.plans.filter((p) => p.from <= date).at(-1);
}

export function isHabitScheduled(habit: Habit, date: string): boolean {
  if (date < dateKey(new Date(habit.createdAt))) return false;
  const plan = planOn(habit, date);
  if (!plan?.active) return false;
  return (
    plan.frequency.kind !== 'weekdays' ||
    plan.frequency.days.includes(new Date(date + 'T12:00:00').getDay())
  );
}

export function completionDates(habit: Habit, completions: HabitCompletion[]): Set<string> {
  return new Set(completions.filter((c) => c.habitId === habit.id).map((c) => c.date));
}

export function weeklyCount(habit: Habit, completions: HabitCompletion[], date: string): number {
  const start = weekStart(date);
  const end = addDays(start, 6);
  return [...completionDates(habit, completions)].filter((d) => d >= start && d <= end).length;
}

export function habitIsDue(habit: Habit, completions: HabitCompletion[], date: string): boolean {
  if (!isHabitScheduled(habit, date)) return false;
  const frequency = planOn(habit, date)!.frequency;
  if (frequency.kind !== 'weekly') return true;
  // Keep today's checkbox visible after the last repetition completes the weekly goal.
  return (
    completionDates(habit, completions).has(date) ||
    weeklyCount(habit, completions, date) < frequency.target
  );
}

/** Daily schedules count only elapsed scheduled days. Flexible goals count per week,
 * capped by available days when the habit or reporting period covers a partial week.
 * The current week's goal remains visible even before the week ends. */
export function habitCompliance(
  habit: Habit,
  completions: HabitCompletion[],
  start: string,
  end: string,
  today: string,
): Compliance {
  const completed = completionDates(habit, completions);
  let done = 0,
    expected = 0;
  const flexible = new Map<string, { days: string[]; target: number }>();
  const frequencyPlans = habit.plans.filter(
    (p, i, plans) =>
      i === 0 ||
      p.active !== plans[i - 1]!.active ||
      JSON.stringify(p.frequency) !== JSON.stringify(plans[i - 1]!.frequency),
  );
  for (const date of datesBetween(start, end)) {
    if (!isHabitScheduled(habit, date)) continue;
    const plan = planOn(habit, date)!;
    if (plan.frequency.kind === 'weekly') {
      const key = weekStart(date) + ':' + frequencyPlans.filter((p) => p.from <= date).at(-1)!.from;
      const group = flexible.get(key) ?? { days: [], target: plan.frequency.target };
      group.days.push(date);
      flexible.set(key, group);
    } else if (date <= today) {
      expected++;
      if (completed.has(date)) done++;
    }
  }
  for (const group of flexible.values()) {
    if (group.days[0]! > today) continue;
    const goal = Math.min(group.target, group.days.length);
    expected += goal;
    done += Math.min(goal, group.days.filter((d) => d <= today && completed.has(d)).length);
  }
  return compliance(done, expected);
}

export function habitStreak(
  habit: Habit,
  completions: HabitCompletion[],
  today: string,
): number | null {
  // Flexible weekly goals do not imply a daily sequence.
  if (planOn(habit, today)?.frequency.kind === 'weekly') return null;
  const completed = completionDates(habit, completions);
  const first = dateKey(new Date(habit.createdAt));
  let streak = 0;
  for (let date = today; date >= first; date = addDays(date, -1)) {
    const plan = planOn(habit, date);
    if (!plan?.active) continue;
    if (plan.frequency.kind === 'weekly') break;
    if (!isHabitScheduled(habit, date)) continue;
    if (completed.has(date)) streak++;
    else if (date !== today) break;
  }
  return streak;
}

export function frequencyLabel(frequency: HabitFrequency): string {
  if (frequency.kind === 'daily') return 'Todos os dias';
  if (frequency.kind === 'weekly') return `${frequency.target} vezes por semana`;
  return frequency.days.map((d) => ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][d]).join(', ');
}
