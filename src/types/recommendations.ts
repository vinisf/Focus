import type { RoutineData, RoutineWindow } from './routine';
import type { IemaTicket } from './iema';
import type { Task } from './index';
import type { Habit, HabitCompletion, HabitProgress } from './habits';
import type { Platform } from './platforms';
import type { PlanningPreferences } from './planning';

export type ActivityFilter = 'all' | 'task' | 'habit' | 'iema' | 'platform';
export interface Deferral {
  key: string;
  until: number;
}
export type ActivityRecommendation = {
  key: string;
  title: string;
  duration: number | null;
  reason: string;
  tier: number;
  score: number;
  plannedAt?: number;
} & (
  | { type: 'routine'; routine: RoutineWindow }
  | { type: 'task'; task: Task }
  | { type: 'habit'; habit: Habit }
  | { type: 'iema'; ticket: IemaTicket }
  | { type: 'platform'; platform: Platform }
);
export interface RecommendationContext {
  routine?: RoutineData;
  tickets?: IemaTicket[];
  platforms?: Platform[];
  preferences?: PlanningPreferences;
  workMinutes?: number;
  tasks: Task[];
  habits: Habit[];
  completions: HabitCompletion[];
  progress?: HabitProgress[];
  sessions?: { habitId: string; completedAt: string }[];
  minutes: number;
  now: Date;
  filter?: ActivityFilter;
  deferred?: Deferral[];
  integrationDailyLimit?: 1 | 2;
  habitsWhenTimelyOrTasksDone?: boolean;
  freeUntil?: string;
  imminentMinutes?: number;
  habitWindowMinutes?: number;
  maxRecommendations?: number;
  ignoreTimeConstraints?: boolean;
  unavailable?: { start: string; end: string }[];
  restWindows?: { start: string; end: string }[];
  plannedActivities?: { key: string; date: string; time: string; included: boolean }[];
}
export interface RecommendationResult {
  activities: ActivityRecommendation[];
  rest: { type: 'rest'; title: string; reason: string };
}
