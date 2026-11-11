import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import type { PlanningData, PlanningPreferences, WorkSession } from '../types/planning';
import { workedMinutes } from '../utils/planning';
const KEY = 'focus.planning.v1';
export const usePlanning = defineStore('planning', () => {
  const data = ref<PlanningData>({
    version: 1,
    preferences: {
      maxWorkMinutes: null,
      excludedSources: [],
      categoryIds: [],
      workCategoryIds: [],
      style: 'any',
      restUntil: null,
    },
    sessions: [],
  });
  const blocked = ref(false);
  const error = ref('');
  function validate(d: PlanningData) {
    const p = d.preferences;
    if (
      d.version !== 1 ||
      !p ||
      !(
        p.maxWorkMinutes === null ||
        (Number.isFinite(p.maxWorkMinutes) && p.maxWorkMinutes >= 0 && p.maxWorkMinutes <= 1440)
      ) ||
      !['any', 'quick', 'deep'].includes(p.style) ||
      !Array.isArray(p.excludedSources) ||
      p.excludedSources.some(
        (s) => !['task', 'habit', 'iema', 'platform', 'routine'].includes(s),
      ) ||
      !Array.isArray(p.categoryIds) ||
      !Array.isArray(p.workCategoryIds) ||
      [...p.categoryIds, ...p.workCategoryIds].some((s) => typeof s !== 'string') ||
      !(p.restUntil === null || Number.isFinite(p.restUntil)) ||
      !Array.isArray(d.sessions) ||
      d.sessions.some(
        (s) =>
          !s ||
          typeof s.id !== 'string' ||
          typeof s.key !== 'string' ||
          !['task', 'iema', 'platform'].includes(s.source) ||
          !Number.isFinite(Date.parse(s.startedAt)) ||
          !(
            s.endedAt === null ||
            (Number.isFinite(Date.parse(s.endedAt)) &&
              Date.parse(s.endedAt) >= Date.parse(s.startedAt))
          ),
      ) ||
      d.sessions.filter((s) => !s.endedAt).length > 1 ||
      new Set(d.sessions.map((s) => s.id)).size !== d.sessions.length
    )
      throw new Error('invalid');
  }
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PlanningData;
      validate(parsed);
      data.value = parsed;
    }
  } catch {
    blocked.value = true;
    error.value =
      'Planejamento salvo ilegível. O original foi preservado; novos registros estão bloqueados.';
  }
  function commit(next: PlanningData) {
    if (blocked.value) return false;
    try {
      validate(next);
      localStorage.setItem(KEY, JSON.stringify(next));
      data.value = next;
      error.value = '';
      return true;
    } catch {
      error.value =
        'Não foi possível salvar o planejamento ou a sessão. Confira os valores e o armazenamento.';
      return false;
    }
  }
  function preferences(fields: Partial<PlanningPreferences>) {
    return commit({ ...data.value, preferences: { ...data.value.preferences, ...fields } });
  }
  const running = computed(() => data.value.sessions.find((s) => s.endedAt === null));
  function start(
    key: string,
    source: WorkSession['source'],
    now = new Date(),
    estimate: number | null = null,
  ) {
    if (running.value) {
      error.value = 'Encerre a sessão atual antes de iniciar outra.';
      return false;
    }
    const limit = data.value.preferences.maxWorkMinutes;
    if (
      limit !== null &&
      (workedMinutes(data.value.sessions, now) >= limit ||
        estimate === null ||
        estimate > limit - workedMinutes(data.value.sessions, now))
    ) {
      error.value =
        'O limite de trabalho não comporta esta sessão. Informe uma estimativa ou ajuste seu limite.';
      return false;
    }
    return commit({
      ...data.value,
      sessions: [
        ...data.value.sessions,
        { id: crypto.randomUUID(), key, source, startedAt: now.toISOString(), endedAt: null },
      ],
    });
  }
  function stop(now = new Date()) {
    return commit({
      ...data.value,
      sessions: data.value.sessions.map((s) =>
        s.endedAt ? s : { ...s, endedAt: now.toISOString() },
      ),
    });
  }
  return { data, error, blocked, preferences, running, start, stop };
});
