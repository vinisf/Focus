import { ref } from 'vue';
import { defineStore } from 'pinia';
import { validDay, validTime } from './assistant';
import type { RoutineData, RoutinePreferences, RoutineException } from '../types/routine';
export const ROUTINE_KEY = 'focus.routine.v1';
export const defaultRoutine = (): RoutinePreferences => ({
  enabled: false,
  days: [0, 1, 2, 3, 4, 5, 6],
  wake: '07:00',
  sleep: '23:00',
  windows: [
    { id: 'breakfast', title: 'Café da manhã', start: '07:00', end: '08:00' },
    { id: 'lunch', title: 'Almoçar', start: '12:30', end: '13:30' },
    { id: 'dinner', title: 'Jantar', start: '19:00', end: '20:00' },
  ],
  work: [],
  rest: [],
});
const intervals = (v: { start: string; end: string }[]) =>
  Array.isArray(v) && v.every((i) => validTime(i.start) && validTime(i.end) && i.start < i.end);
const windows = (v: RoutinePreferences['windows']) =>
  intervals(v) &&
  v.every(
    (w) => typeof w.id === 'string' && !!w.id && typeof w.title === 'string' && !!w.title.trim(),
  ) &&
  new Set(v.map((w) => w.id)).size === v.length;
export function validRoutine(d: RoutineData): boolean {
  const p = d?.preferences;
  return (
    !!p &&
    d.version === 1 &&
    typeof p.enabled === 'boolean' &&
    Array.isArray(p.days) &&
    p.days.every((n) => Number.isInteger(n) && n >= 0 && n <= 6) &&
    validTime(p.wake) &&
    validTime(p.sleep) &&
    p.wake !== p.sleep &&
    windows(p.windows) &&
    intervals(p.work) &&
    intervals(p.rest) &&
    typeof d.timer === 'boolean' &&
    Array.isArray(d.exceptions) &&
    d.exceptions.every(
      (e) =>
        validDay(e.date) &&
        (!e.wake || validTime(e.wake)) &&
        (!e.windows || windows(e.windows)) &&
        (!e.skipHabitIds ||
          (Array.isArray(e.skipHabitIds) &&
            e.skipHabitIds.every((id) => typeof id === 'string'))) &&
        intervals(e.unavailable),
    ) &&
    Array.isArray(d.states) &&
    d.states.every(
      (s) =>
        validDay(s.date) &&
        typeof s.id === 'string' &&
        typeof s.done === 'boolean' &&
        Number.isFinite(s.until),
    )
  );
}
export const useRoutine = defineStore('routine', () => {
  const data = ref<RoutineData>({
    version: 1,
    preferences: defaultRoutine(),
    exceptions: [],
    states: [],
    timer: false,
  });
  const error = ref('');
  const blocked = ref(false);
  try {
    const raw = localStorage.getItem(ROUTINE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (!validRoutine(parsed)) throw Error();
      data.value = parsed;
    }
  } catch {
    blocked.value = true;
    error.value = 'Rotina salva ilegível. O original foi preservado.';
  }
  function save(fields: Partial<RoutineData>) {
    if (blocked.value) return false;
    try {
      const next = { ...data.value, ...fields };
      if (!validRoutine(next)) throw Error();
      localStorage.setItem(ROUTINE_KEY, JSON.stringify(next));
      data.value = next;
      error.value = '';
      return true;
    } catch {
      error.value = 'Não foi possível salvar. Confira as janelas e o armazenamento.';
      return false;
    }
  }
  function exception(value: RoutineException) {
    return save({
      exceptions: [...data.value.exceptions.filter((e) => e.date !== value.date), value],
    });
  }
  function respond(id: string, date: string, done: boolean, until: number) {
    return save({
      states: [
        ...data.value.states.filter((s) => s.date !== date || s.id !== id),
        { id, date, done, until },
      ],
    });
  }
  return { data, error, blocked, save, exception, respond };
});
