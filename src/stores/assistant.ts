import { defineStore } from 'pinia';
import { ref } from 'vue';
import { dateKey } from '../utils/dates';
import type { RecommendationRound } from '../services/RecommendationEngine';
export interface PlanEntry {
  key: string;
  date: string;
  time: string;
  included: boolean;
}
export interface DayPlan {
  date: string;
  start: string;
  end: string;
  unavailable: { start: string; end: string }[];
  entries: PlanEntry[];
}
export interface AssistantData {
  version: 1;
  round?: RecommendationRound;
  notification: { enabled: boolean; time: string };
  imminentMinutes: number;
  habitWindowMinutes: number;
  restStart: string;
  restEnd: string;
  plans: DayPlan[];
}
export const validTime = (v: unknown): v is string =>
  typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
export const validDay = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  dateKey(new Date(v + 'T12:00:00')) === v;
const KEY = 'focus.assistant.v1';
function valid(d: AssistantData) {
  return (
    d?.version === 1 &&
    typeof d.notification?.enabled === 'boolean' &&
    validTime(d.notification.time) &&
    Number.isFinite(d.imminentMinutes) &&
    d.imminentMinutes >= 0 &&
    d.imminentMinutes <= 120 &&
    Number.isFinite(d.habitWindowMinutes) &&
    d.habitWindowMinutes >= 0 &&
    d.habitWindowMinutes <= 240 &&
    (d.restStart === '' || validTime(d.restStart)) &&
    (d.restEnd === '' || validTime(d.restEnd)) &&
    (!d.round ||
      (validDay(d.round.date) &&
        Number.isInteger(d.round.number) &&
        d.round.number > 0 &&
        Array.isArray(d.round.skipped) &&
        d.round.skipped.every(
          (s) => typeof s.key === 'string' && (s.urgency === null || typeof s.urgency === 'string'),
        ))) &&
    Array.isArray(d.plans) &&
    d.plans.every(
      (p) =>
        validDay(p.date) &&
        validTime(p.start) &&
        validTime(p.end) &&
        p.start < p.end &&
        Array.isArray(p.unavailable) &&
        p.unavailable.every((i) => validTime(i.start) && validTime(i.end) && i.start < i.end) &&
        Array.isArray(p.entries) &&
        p.entries.every(
          (e) =>
            typeof e.key === 'string' &&
            validDay(e.date) &&
            (e.time === '' || validTime(e.time)) &&
            typeof e.included === 'boolean',
        ) &&
        new Set(p.entries.map((e) => e.key)).size === p.entries.length,
    )
  );
}
export const useAssistant = defineStore('assistant', () => {
  const data = ref<AssistantData>({
    version: 1,
    notification: { enabled: false, time: '20:00' },
    imminentMinutes: 15,
    habitWindowMinutes: 60,
    restStart: '',
    restEnd: '',
    plans: [],
  });
  const error = ref('');
  const blocked = ref(false);
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (!valid(parsed)) throw new Error('invalid');
      data.value = parsed;
    }
  } catch {
    blocked.value = true;
    error.value = 'Preferências do assistente ilegíveis. O original foi preservado.';
  }
  function save(fields: Partial<AssistantData>) {
    if (blocked.value) return false;
    try {
      const next = { ...data.value, ...fields };
      if (!valid(next)) throw new Error('invalid');
      localStorage.setItem(KEY, JSON.stringify(next));
      data.value = next;
      error.value = '';
      return true;
    } catch {
      error.value =
        'Não foi possível salvar o planejamento. Confira os horários e o armazenamento.';
      return false;
    }
  }
  function savePlan(plan: DayPlan) {
    return save({ plans: [...data.value.plans.filter((p) => p.date !== plan.date), plan] });
  }
  return { data, error, blocked, save, savePlan };
});
