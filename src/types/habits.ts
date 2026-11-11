export type HabitFrequency =
  { kind: 'daily' } | { kind: 'weekdays'; days: number[] } | { kind: 'weekly'; target: number };

export const habitIcons = ['leaf', 'dumbbell', 'book', 'droplets', 'heart', 'sun'] as const;
export type HabitIcon = (typeof habitIcons)[number];

export type HabitGoal =
  | { kind: 'check'; description: string }
  | { kind: 'quantity'; description: string; target: number; unit: string };

export interface HabitPlan {
  from: string;
  frequency: HabitFrequency;
  active: boolean;
  goal?: HabitGoal;
}

export interface Habit {
  duration?: number;
  intensity?: 'light' | 'moderate' | 'high';
  effort?: 'physical' | 'mental' | 'other';
  minIntervalHours?: number;
  allowMultipleSessions?: boolean;
  id: string;
  name: string;
  goal?: HabitGoal;
  description: string;
  categoryId: string | null;
  icon: HabitIcon;
  frequency: HabitFrequency;
  preferredTime: string;
  createdAt: string;
  status: 'active' | 'archived';
  plans: HabitPlan[];
}

export interface HabitCompletion {
  id: string;
  habitId: string;
  date: string;
  completedAt: string;
  goal?: HabitGoal;
  value?: number;
}

export interface HabitProgress {
  habitId: string;
  date: string;
  value: number;
  updatedAt: string;
}

export interface HabitData {
  version: 1;
  habits: Habit[];
  completions: HabitCompletion[];
  progress?: HabitProgress[];
  sessions?: { habitId: string; completedAt: string }[];
}
