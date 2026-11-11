export interface LifeArea {
  id: string;
  name: string;
}
export interface Milestone {
  id: string;
  title: string;
  done: boolean;
}
export interface Goal {
  id: string;
  areaId: string;
  title: string;
  description: string;
  horizon: 'short' | 'medium' | 'long';
  dueDate: string;
  status: 'active' | 'paused' | 'done' | 'cancelled';
  milestones: Milestone[];
  taskIds: string[];
}
export interface WeeklyBlock {
  id: string;
  title: string;
  date: string;
  kind: 'fixed' | 'flexible';
  start: string;
  end: string;
  status: 'planned' | 'cancelled';
  goalId: string;
}
export interface LifePlanningData {
  version: 1;
  timezone: string;
  areas: LifeArea[];
  goals: Goal[];
  blocks: WeeklyBlock[];
}
