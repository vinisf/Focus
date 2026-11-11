import type { Habit, HabitCompletion, HabitGoal, HabitProgress } from '../types/habits';
import { planOn } from './habits';

export function defaultHabitGoal(): HabitGoal {
  return { kind: 'check', description: '' };
}

export function goalForDate(
  habit: Habit,
  date: string,
  completions: HabitCompletion[] = [],
): HabitGoal {
  const completion = completions.find((c) => c.habitId === habit.id && c.date === date);
  // A completed record keeps the criterion that applied when it was achieved.
  if (completion) return completion.goal ?? defaultHabitGoal();
  return planOn(habit, date)?.goal ?? defaultHabitGoal();
}

export function progressForDate(
  habit: Habit,
  date: string,
  completions: HabitCompletion[],
  progress: HabitProgress[],
): number {
  return (
    progress.find((p) => p.habitId === habit.id && p.date === date)?.value ??
    completions.find((c) => c.habitId === habit.id && c.date === date)?.value ??
    0
  );
}
