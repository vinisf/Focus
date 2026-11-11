import { ref } from 'vue';
import { defineStore } from 'pinia';
export interface FocusExecution {
  key: string;
  title: string;
  type: 'task' | 'habit' | 'iema' | 'platform';
  elapsed: number;
  since: number | null;
}
const KEY = 'focus.execution.v1';
export const validExecution = (v: FocusExecution | null) =>
  v === null ||
  (typeof v.key === 'string' &&
    typeof v.title === 'string' &&
    ['task', 'habit', 'iema', 'platform'].includes(v.type) &&
    Number.isFinite(v.elapsed) &&
    v.elapsed >= 0 &&
    (v.since === null || Number.isFinite(v.since)));
export const useFocusExecution = defineStore('focusExecution', () => {
  const current = ref<FocusExecution | null>(null);
  const error = ref('');
  const blocked = ref(false);
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const value = JSON.parse(raw);
      if (!validExecution(value)) throw Error();
      current.value = value;
    }
  } catch {
    blocked.value = true;
    error.value = 'Sessão de foco ilegível. O original foi preservado.';
  }
  function save(value: FocusExecution | null) {
    if (blocked.value) return false;
    try {
      if (!validExecution(value)) throw Error();
      localStorage.setItem(KEY, JSON.stringify(value));
      current.value = value;
      error.value = '';
      return true;
    } catch {
      error.value = 'Não foi possível salvar a sessão de foco.';
      return false;
    }
  }
  function start(value: Pick<FocusExecution, 'key' | 'title' | 'type'>, now: number) {
    return !current.value && save({ ...value, elapsed: 0, since: now });
  }
  function pause(now: number) {
    const v = current.value;
    return (
      !!v &&
      save({
        ...v,
        elapsed: v.elapsed + (v.since === null ? 0 : Math.max(0, now - v.since)),
        since: null,
      })
    );
  }
  function resume(now: number) {
    const v = current.value;
    return !!v && v.since === null && save({ ...v, since: now });
  }
  return { current, error, blocked, start, pause, resume, clear: () => save(null) };
});
