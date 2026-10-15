import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import type { Data, Task, Status } from '../types';
import { LocalRepository } from '../services/repository';
import { nextOccurrence } from '../utils/recurrence';
export const useTasks = defineStore('tasks', () => {
  const repository = new LocalRepository();
  const error = ref('');
  const blocked = ref(false);
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
      color: ['#7664d8', '#d49153', '#57a68c', '#b375bd', '#589bc3', '#d1818b'][i]!,
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
      if (blocked.value) return;
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
  return { data, error, blocked, save, status, plan };
});
