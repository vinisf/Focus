<script setup lang="ts">
import { computed } from 'vue';
import { Leaf, Plus } from 'lucide-vue-next';
import { useHabits } from '../stores/habits';
import type { Habit } from '../types/habits';
import { frequencyLabel, habitIsDue, isHabitScheduled } from '../utils/habits';
import HabitRow from './HabitRow.vue';
import HabitIcon from './HabitIcon.vue';
const props = defineProps<{ today: string }>();
const emit = defineEmits<{ create: []; history: [habit: Habit]; changed: [message: string] }>();
const store = useHabits();
const habits = computed(() =>
  store.data.habits.filter((h) => habitIsDue(h, store.data.completions, props.today)),
);
const otherDays = computed(() =>
  store.data.habits.filter(
    (h) =>
      h.status === 'active' &&
      h.frequency.kind === 'weekdays' &&
      !isHabitScheduled(h, props.today),
  ),
);
const done = computed(
  () =>
    habits.value.filter((h) =>
      store.data.completions.some((c) => c.habitId === h.id && c.date === props.today),
    ).length,
);
</script>
<template>
  <section class="habits-today" aria-labelledby="habits-today-title">
    <div class="section-heading">
      <h2 id="habits-today-title">
        <Leaf :size="18" />Hábitos de hoje <span class="count-pill">{{ habits.length }}</span>
      </h2>
      <button class="text-button" :disabled="store.blocked" @click="emit('create')">
        <Plus :size="14" />Novo hábito
      </button>
    </div>
    <p class="section-description">
      {{
        habits.length
          ? `Hábitos: ${done} de ${habits.length} realizados`
          : 'Nenhum hábito previsto para hoje.'
      }}
      <span>Consistência no seu ritmo.</span>
    </p>
    <div class="habit-list">
      <HabitRow
        v-for="habit in habits"
        :key="habit.id"
        :habit="habit"
        :date="today"
        @history="emit('history', $event)"
        @changed="emit('changed', $event)"
      />
      <div v-if="!habits.length" class="habit-empty">
        <Leaf :size="21" />
        <p>
          {{
            store.data.habits.length
              ? 'Um dia de descanso também faz parte.'
              : 'Pequenas práticas, um espaço próprio.'
          }}
        </p>
        <span>{{
          store.data.habits.length
            ? 'Os próximos hábitos aparecerão no dia previsto.'
            : 'Adicione um hábito sem misturar com suas entregas.'
        }}</span>
      </div>
    </div>
    <div v-if="otherDays.length" class="habit-other-days">
      <h3>Em outros dias</h3>
      <p class="section-description">Hábitos cadastrados para outros dias da semana.</p>
      <div class="habit-list">
        <article v-for="habit in otherDays" :key="habit.id" class="habit-row">
          <span class="habit-symbol"><HabitIcon :name="habit.icon" /></span>
          <button class="habit-content" @click="emit('history', habit)">
            <strong>{{ habit.name }}</strong>
            <span>{{ frequencyLabel(habit.frequency) }}</span>
            <small>Ver calendário e histórico</small>
          </button>
        </article>
      </div>
    </div>
  </section>
</template>
