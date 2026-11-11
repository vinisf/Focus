<script setup lang="ts">
import { computed } from 'vue';
import { Check, Pencil, Archive, RotateCcw } from 'lucide-vue-next';
import type { Habit } from '../types/habits';
import { useHabits } from '../stores/habits';
import { useTasks } from '../stores/tasks';
import { frequencyLabel, weeklyCount } from '../utils/habits';
import HabitIcon from './HabitIcon.vue';
import HabitTracker from './HabitTracker.vue';
import { goalForDate } from '../utils/habitGoals';
const props = defineProps<{ habit: Habit; date: string; manage?: boolean }>();
const emit = defineEmits<{
  edit: [habit: Habit];
  history: [habit: Habit];
  changed: [message: string];
}>();
const store = useHabits();
const tasks = useTasks();
const checked = computed(() =>
  store.data.completions.some((c) => c.habitId === props.habit.id && c.date === props.date),
);
const category = computed(() => tasks.data.categories.find((c) => c.id === props.habit.categoryId));
const goal = computed(() => goalForDate(props.habit, props.date, store.data.completions));
const displayGoal = computed(() => (props.manage ? props.habit.goal : goal.value));
function archive() {
  const active = props.habit.status === 'active';
  store.archive(props.habit.id);
  emit('changed', active ? 'Hábito arquivado. Seu histórico foi preservado.' : 'Hábito reativado.');
}
</script>
<template>
  <article
    class="habit-row"
    :class="{ 'habit-done': checked, 'habit-has-quantity': !manage && goal.kind === 'quantity' }"
  >
    <HabitTracker
      v-if="!manage && goal.kind === 'check'"
      :habit="habit"
      :date="date"
      @changed="emit('changed', $event)"
    />
    <span class="habit-symbol"><HabitIcon :name="habit.icon" /></span>
    <button class="habit-content" @click="emit('history', habit)">
      <strong>{{ habit.name }}</strong
      ><span v-if="displayGoal?.description" class="habit-goal"
        >Meta: {{ displayGoal.description }}</span
      ><span
        >{{ frequencyLabel(habit.frequency)
        }}<template v-if="habit.preferredTime"> · {{ habit.preferredTime }}</template
        ><template v-if="habit.frequency.kind === 'weekly'">
          · {{ weeklyCount(habit, store.data.completions, date) }}/{{
            habit.frequency.target
          }}
          nesta semana</template
        ></span
      ><small v-if="category" :style="{ color: category.color }">{{ category.name }}</small>
    </button>
    <HabitTracker
      v-if="!manage && goal.kind === 'quantity'"
      :habit="habit"
      :date="date"
      @changed="emit('changed', $event)"
    />
    <span v-if="checked" class="habit-done-label"><Check :size="13" />Realizado</span>
    <template v-if="manage"
      ><span v-if="habit.status === 'archived'" class="habit-archived-label">Arquivado</span
      ><button
        class="icon-button"
        :aria-label="'Editar hábito ' + habit.name"
        @click="emit('edit', habit)"
      >
        <Pencil :size="16" /></button
      ><button
        class="icon-button"
        :disabled="store.blocked"
        :aria-label="(habit.status === 'active' ? 'Arquivar ' : 'Reativar ') + habit.name"
        @click="archive"
      >
        <component :is="habit.status === 'active' ? Archive : RotateCcw" :size="16" /></button
    ></template>
  </article>
</template>
