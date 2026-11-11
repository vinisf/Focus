import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import type { Data, Task, Status } from '../types';
import { LocalRepository, validTask } from '../services/repository';
import { nextOccurrence } from '../utils/recurrence';
import { cleanName, normalizedName } from '../services/integrations/excel/import';
import type { ImportRow } from '../services/integrations/excel/import';
import { addDays, dateKey } from '../utils/dates';
import { usePlanning } from './planning';
export const useTasks = defineStore('tasks', () => {
  const repository = new LocalRepository();
  const error = ref('');
  const blocked = ref(false);
  let committing = false;
  const data = ref<Data>({
    version: 1,
    tasks: [],
    categories: [
      'Trabalho',
      'Projetos pessoais',
      'Saúde e treino',
      'Igreja',
      'Estudos',
      'Vida pessoal',
    ].map((name, i) => ({
      id: String(i),
      name,
      color: ['#356fb0', '#d49153', '#57a68c', '#b375bd', '#589bc3', '#d1818b'][i]!,
    })),
  });
  try {
    const saved = repository.load();
    if (saved) data.value = saved;
  } catch {
    error.value =
      'Não foi possível ler os dados salvos. Eles foram preservados. Exporte uma cópia antes de reiniciar o armazenamento.';
    blocked.value = true;
  }
  watch(
    data,
    () => {
      if (blocked.value || committing) return;
      try {
        repository.save(data.value);
        error.value = '';
      } catch {
        error.value =
          'Não foi possível salvar neste navegador. Exporte seus dados para não perder as alterações.';
      }
    },
    { deep: true, flush: 'sync' },
  );
  function save(task: Task) {
    const i = data.value.tasks.findIndex((t) => t.id === task.id);
    if (i < 0) data.value.tasks.push(task);
    else data.value.tasks[i] = task;
  }
  function status(task: Task, value: Status) {
    if (value === task.status) return;
    if (value === 'done') {
      const next = nextOccurrence(task);
      if (next) {
        task.nextId = next.id;
        data.value.tasks.push(next);
      }
      task.completedAt = new Date().toISOString();
    } else task.completedAt = null;
    task.status = value;
  }
  function plan(task: Task, date: string) {
    task.plannedDate = date;
  }
  function planMany(entries: { id: string; date: string; time: string }[]) {
    const next = {
      ...data.value,
      tasks: data.value.tasks.map((t) => {
        const entry = entries.find((e) => e.id === t.id);
        return entry ? { ...t, plannedDate: entry.date, scheduledTime: entry.time } : t;
      }),
    };
    if (!next.tasks.every(validTask)) {
      error.value = 'Confira as datas e os horários do planejamento.';
      return false;
    }
    return commit(next);
  }
  function remove(id: string): boolean {
    if (blocked.value || !data.value.tasks.some((t) => t.id === id)) return false;
    const updated = { ...data.value, tasks: data.value.tasks.filter((t) => t.id !== id) };
    try {
      repository.save(updated);
      data.value = updated;
      return true;
    } catch {
      error.value = 'Não foi possível excluir a tarefa no armazenamento. Tente novamente.';
      return false;
    }
  }
  function commit(next: Data): boolean {
    if (blocked.value) return false;
    try {
      repository.save(next);
      committing = true;
      data.value = next;
      error.value = '';
      return true;
    } catch {
      error.value =
        'Não foi possível salvar as tarefas de integração. Os dados anteriores foram preservados.';
      return false;
    } finally {
      committing = false;
    }
  }
  function importIntegrations(rows: ImportRow[], now = new Date()): number | null {
    const known = new Set(
      data.value.tasks
        .filter((t) => t.integrationName)
        .map((t) => normalizedName(t.integrationName!)),
    );
    const names: string[] = [];
    for (const row of rows) {
      if (row.status !== 'pending' || !row.included) continue;
      const name = cleanName(row.name);
      const identity = normalizedName(name);
      if (!name || known.has(identity)) continue;
      known.add(identity);
      names.push(name);
    }
    if (!names.length) return blocked.value ? null : 0;
    const category = data.value.categories.find(
      (c) => normalizedName(c.name) === 'integracoes',
    ) ?? { id: crypto.randomUUID(), name: 'Integrações', color: '#356fb0' };
    const tasks: Task[] = names.map((name, index) => ({
      id: crypto.randomUUID(),
      title: `Integrar ${name}`,
      integrationName: name,
      description: '',
      categoryId: category.id,
      dueDate: '',
      time: '',
      plannedDate: '',
      priority: 'medium',
      importance: 'medium',
      duration: 30,
      status: 'pending',
      createdAt: new Date(now.getTime() + index).toISOString(),
      completedAt: null,
      recurrence: null,
    }));
    const next = {
      ...data.value,
      tasks: [...data.value.tasks, ...tasks],
      categories: data.value.categories.some((c) => c.id === category.id)
        ? data.value.categories
        : [...data.value.categories, category],
    };
    return commit(next) ? tasks.length : null;
  }
  function integrationLimit(limit: 1 | 2): boolean {
    return [1, 2].includes(limit) && commit({ ...data.value, integrationDailyLimit: limit });
  }
  function postponeIntegration(task: Task, now = new Date()): boolean {
    if (!task.integrationName || !['pending', 'active'].includes(task.status)) return false;
    const planning = usePlanning();
    if (planning.running?.key === `task:${task.id}` && !planning.stop(now)) {
      error.value = 'Não foi possível encerrar a sessão. Encerre-a antes de adiar a integração.';
      return false;
    }
    return commit({
      ...data.value,
      tasks: data.value.tasks.map((t) =>
        t.id === task.id
          ? {
              ...t,
              plannedDate: addDays(dateKey(now), 1),
              integrationDeferredOn: dateKey(now),
            }
          : t,
      ),
    });
  }
  function clearIntegrations(): boolean {
    if (
      data.value.tasks.some(
        (t) => t.integrationName && usePlanning().running?.key === `task:${t.id}`,
      )
    ) {
      error.value = 'Encerre a sessão de integração em andamento antes de apagar as tarefas.';
      return false;
    }
    return commit({ ...data.value, tasks: data.value.tasks.filter((t) => !t.integrationName) });
  }
  return {
    data,
    error,
    blocked,
    save,
    status,
    plan,
    planMany,
    remove,
    importIntegrations,
    integrationLimit,
    postponeIntegration,
    clearIntegrations,
  };
});
