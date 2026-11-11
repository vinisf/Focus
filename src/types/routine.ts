export interface RoutineWindow {
  id: string;
  title: string;
  start: string;
  end: string;
}
export interface RoutinePreferences {
  enabled: boolean;
  days: number[];
  wake: string;
  sleep: string;
  windows: RoutineWindow[];
  work: { start: string; end: string }[];
  rest: { start: string; end: string }[];
}
export interface RoutineException {
  date: string;
  wake?: string;
  windows?: RoutineWindow[];
  skipHabitIds?: string[];
  unavailable: { start: string; end: string }[];
}
export interface RoutineState {
  date: string;
  id: string;
  done: boolean;
  until: number;
}
export interface RoutineData {
  version: 1;
  preferences: RoutinePreferences;
  exceptions: RoutineException[];
  states: RoutineState[];
  timer: boolean;
}
