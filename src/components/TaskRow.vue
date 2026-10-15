<script setup lang="ts">
import { Check, CalendarDays, Clock3, Repeat2, Pencil } from 'lucide-vue-next';
import type { Task } from '../types';
import { useTasks } from '../stores/tasks';
import { dateKey, displayDate } from '../utils/dates';
defineProps<{ task: Task; today: string }>();
defineEmits<{ edit: [task: Task]; completed: [] }>();
const store = useTasks();
const priorities = { low: 'Baixa', medium: 'Média', high: 'Alta', urgent: 'Urgente' };
</script>
<template>
  <article class="task-row" :class="{ completed: task.status === 'done' }">
    <button
      class="check-task"
      :class="{ checked: task.status === 'done' }"
      :aria-label="task.status === 'done' ? 'Reabrir ' + task.title : 'Concluir ' + task.title"
      @click="
        store.status(task, task.status === 'done' ? 'pending' : 'done');
        task.status === 'done' && $emit('completed');
      "
    >
      <Check v-if="task.status === 'done'" :size="14" />
    </button>
    <button class="task-content" @click="$emit('edit', task)">
      <strong>{{ task.title }}</strong
      ><span class="task-meta"
        ><span
          :style="{ color: store.data.categories.find((c) => c.id === task.categoryId)?.color }"
          >● {{ store.data.categories.find((c) => c.id === task.categoryId)?.name }}</span
        ><span><Clock3 :size="12" /> {{ task.duration }} min</span
        ><span v-if="task.dueDate" :class="{ late: task.dueDate < today && task.status !== 'done' }"
          ><CalendarDays :size="12" />{{
            task.dueDate === today ? 'Hoje' : displayDate(task.dueDate)
          }}
          {{ task.time }}</span
        ><Repeat2 v-if="task.recurrence" :size="13" /><span v-if="task.plannedDate"
          >Planejada:
          {{ task.plannedDate === today ? 'hoje' : displayDate(task.plannedDate) }}</span
        ></span
      >
    </button>
    <span class="priority" :class="task.priority">{{ priorities[task.priority] }}</span>
    <select
      class="status-select"
      aria-label="Status da tarefa"
      :value="task.status"
      @change="store.status(task, ($event.target as HTMLSelectElement).value as Task['status'])"
    >
      <option value="pending">Pendente</option>
      <option value="active">Em andamento</option>
      <option value="done">Concluída</option>
      <option value="cancelled">Cancelada</option>
    </select>
    <button
      class="icon-button plan-button"
      aria-label="Planejar para hoje"
      title="Planejar para hoje"
      @click="store.plan(task, dateKey())"
    >
      <CalendarDays :size="16" /></button
    ><button class="icon-button" aria-label="Editar tarefa" @click="$emit('edit', task)">
      <Pencil :size="15" />
    </button>
  </article>
</template>
