<script setup lang="ts">
import { computed } from 'vue';
import { Minus, Plus } from 'lucide-vue-next';
import type { Habit } from '../types/habits';
import { useHabits } from '../stores/habits';
import { goalForDate, progressForDate } from '../utils/habitGoals';
const props = defineProps<{ habit: Habit; date: string }>();
const emit = defineEmits<{ changed: [message: string] }>();
const store = useHabits();
const goal = computed(() => goalForDate(props.habit, props.date, store.data.completions));
const checked = computed(() =>
  store.data.completions.some((c) => c.habitId === props.habit.id && c.date === props.date),
);
const value = computed(() =>
  progressForDate(props.habit, props.date, store.data.completions, store.data.progress ?? []),
);
function toggle() {
  if (store.setCompleted(props.habit.id, props.date, !checked.value))
    emit(
      'changed',
      checked.value ? 'Hábito realizado. Um dia de cada vez.' : 'Realização desmarcada.',
    );
}
function update(amount: number) {
  if (store.setProgress(props.habit.id, props.date, amount))
    emit(
      'changed',
      checked.value ? 'Meta cumprida. Hábito realizado.' : 'Progresso do hábito salvo.',
    );
}
</script>
<template>
  <input
    v-if="goal.kind === 'check'"
    type="checkbox"
    class="habit-checkbox"
    :checked="checked"
    :aria-label="'Realizado: ' + habit.name"
    :disabled="store.blocked"
    @change="toggle"
  />
  <div
    v-else
    class="habit-quantity-tracker"
    role="group"
    :aria-label="'Progresso de ' + habit.name"
  >
    <button
      class="icon-button"
      :disabled="store.blocked || value <= 0"
      :aria-label="'Diminuir quantidade de ' + habit.name"
      @click="update(Math.max(0, Math.round((value - 1) * 1000) / 1000))"
    >
      <Minus :size="13" />
    </button>
    <input
      type="number"
      min="0"
      max="1000000000"
      step="any"
      :value="value"
      :disabled="store.blocked"
      :aria-label="'Quantidade realizada: ' + habit.name"
      @change="update(($event.target as HTMLInputElement).valueAsNumber)"
    />
    <span>/ {{ goal.target }} {{ goal.unit }}</span>
    <button
      class="icon-button"
      :disabled="store.blocked"
      :aria-label="'Aumentar quantidade de ' + habit.name"
      @click="update(Math.round((value + 1) * 1000) / 1000)"
    >
      <Plus :size="13" />
    </button>
  </div>
</template>
