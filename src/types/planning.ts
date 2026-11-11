export type ActivitySource = 'task' | 'habit' | 'iema' | 'platform' | 'routine';
export interface PlanningPreferences {
  maxWorkMinutes: number | null;
  excludedSources: ActivitySource[];
  categoryIds: string[];
  workCategoryIds: string[];
  style: 'any' | 'quick' | 'deep';
  restUntil: number | null;
}
export interface WorkSession {
  id: string;
  key: string;
  source: 'task' | 'iema' | 'platform';
  startedAt: string;
  endedAt: string | null;
}
export interface PlanningData {
  version: 1;
  preferences: PlanningPreferences;
  sessions: WorkSession[];
}
