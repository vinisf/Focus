import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import { useTasks } from './tasks';
import { validLocalDate } from '../services/habitRepository';
import { performanceTask, type PerformanceTask, type TaskSnapshot } from '../utils/performance';

const KEY = 'focus.performance.v1';
function validMetricTask(task: PerformanceTask) {
  return (
    task &&
    typeof task.id === 'string' &&
    !!task.id &&
    (task.plannedDate === '' || validLocalDate(task.plannedDate)) &&
    (task.dueDate === '' || validLocalDate(task.dueDate)) &&
    ['pending', 'active', 'done', 'cancelled'].includes(task.status) &&
    Number.isFinite(task.duration) &&
    task.duration > 0 &&
    Number.isFinite(Date.parse(task.createdAt)) &&
    (task.completedAt === null || Number.isFinite(Date.parse(task.completedAt)))
  );
}
export function validatePerformance(data: { version: number; snapshots: TaskSnapshot[] }) {
  if (
    data.version !== 1 ||
    !Array.isArray(data.snapshots) ||
    data.snapshots.some(
      (s: TaskSnapshot, i: number) =>
        !s ||
        !Number.isFinite(Date.parse(s.at)) ||
        !Array.isArray(s.tasks) ||
        !s.tasks.every(validMetricTask) ||
        (i > 0 && s.at < data.snapshots[i - 1].at),
    )
  )
    throw new Error('invalid');
}
export const usePerformanceHistory = defineStore('performance-history', () => {
  const tasks = useTasks();
  const snapshots = ref<TaskSnapshot[]>([]);
  const error = ref('');
  const blocked = ref(false);
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      validatePerformance(parsed);
      snapshots.value = parsed.snapshots;
    }
  } catch {
    blocked.value = true;
    error.value = 'Histórico de planejamento indisponível. O arquivo original foi preservado.';
  }
  function record() {
    if (blocked.value || tasks.blocked) return;
    const current = tasks.data.tasks.map(performanceTask);
    if (JSON.stringify(snapshots.value.at(-1)?.tasks) === JSON.stringify(current)) return;
    const next = [...snapshots.value, { at: new Date().toISOString(), tasks: current }];
    try {
      localStorage.setItem(KEY, JSON.stringify({ version: 1, snapshots: next }));
      snapshots.value = next;
      error.value = '';
    } catch {
      error.value = 'Não foi possível registrar o histórico de planejamento.';
    }
  }
  // Observe complete mutations together, without modifying task records or their storage.
  watch(() => tasks.data.tasks, record, { deep: true, immediate: true });
  return { snapshots, error, blocked };
});
