<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRoutine } from '../stores/routine';
import { useHabits } from '../stores/habits';
import { dateKey } from '../utils/dates';
import type { RoutineException, RoutinePreferences } from '../types/routine';
const props = defineProps<{ todayOnly?: boolean; date?: string }>();
const store = useRoutine();
const habits = useHabits();
const draft = ref<RoutinePreferences>(JSON.parse(JSON.stringify(store.data.preferences)));
const day = ref(props.date ?? dateKey(new Date()));
const message = ref('');
const updateDefault = ref(false);
const exception = ref<RoutineException>({ date: day.value, unavailable: [], skipHabitIds: [] });
function load() {
  exception.value = JSON.parse(
    JSON.stringify(
      store.data.exceptions.find((e) => e.date === day.value) ?? {
        date: day.value,
        unavailable: [],
      },
    ),
  );
  exception.value.skipHabitIds ??= [];
}
watch(day, load, { immediate: true });
watch(
  () => props.date,
  (value) => {
    if (value) day.value = value;
  },
);
const start = ref('14:00'),
  end = ref('15:00');
function save() {
  const ok = props.todayOnly
    ? store.exception({ ...exception.value, date: day.value })
    : store.save({ preferences: draft.value });
  if (ok && props.todayOnly && updateDefault.value) {
    if (
      !store.save({
        preferences: {
          ...store.data.preferences,
          wake: exception.value.wake ?? store.data.preferences.wake,
          windows: exception.value.windows ?? store.data.preferences.windows,
        },
      })
    ) {
      message.value = store.error;
      return;
    }
  }
  message.value = ok ? 'Salvo. Você pode ajustar quando precisar.' : store.error;
}
function lunch() {
  exception.value.windows ??= JSON.parse(JSON.stringify(store.data.preferences.windows));
}
</script>
<template>
  <form class="routine-settings" @submit.prevent="save">
    <template v-if="!todayOnly">
      <p>
        Horários flexíveis para orientar sugestões. A rotina não cria tarefas nem conta nas suas
        métricas.
      </p>
      <label><input v-model="draft.enabled" type="checkbox" /> Usar minha rotina</label>
      <label>Acordar <input v-model="draft.wake" type="time" required /></label>
      <label>Dormir <input v-model="draft.sleep" type="time" required /></label>
      <fieldset>
        <legend>Dias da semana</legend>
        <label v-for="(name, i) in ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']" :key="i"
          ><input v-model="draft.days" type="checkbox" :value="i" />{{ name }}</label
        >
      </fieldset>
      <fieldset>
        <legend>Janelas habituais</legend>
        <div v-for="w in draft.windows" :key="w.id">
          <label
            >{{ w.title }} <input v-model="w.start" type="time" required /> até
            <input v-model="w.end" type="time" required
          /></label>
        </div>
      </fieldset>
      <fieldset v-for="field in ['work', 'rest'] as const" :key="field">
        <legend>{{ field === 'work' ? 'Horários de trabalho' : 'Períodos de descanso' }}</legend>
        <div v-for="(w, i) in draft[field]" :key="i">
          <input v-model="w.start" type="time" required aria-label="Início" /> até
          <input v-model="w.end" type="time" required aria-label="Fim" /><button
            type="button"
            @click="draft[field].splice(i, 1)"
          >
            Remover
          </button>
        </div>
        <button type="button" @click="draft[field].push({ start: '09:00', end: '10:00' })">
          Adicionar período
        </button>
      </fieldset>
      <label
        ><input
          type="checkbox"
          :checked="store.data.timer"
          @change="store.save({ timer: ($event.target as HTMLInputElement).checked })"
        />
        Mostrar cronômetro durante o foco</label
      >
    </template>
    <template v-else>
      <label>Somente neste dia <input v-model="day" type="date" required /></label>
      <label>Acordei mais tarde <input v-model="exception.wake" type="time" /></label>
      <button type="button" @click="lunch">Vou almoçar mais tarde / ajustar refeições</button>
      <div v-for="w in exception.windows" :key="w.id">
        <label
          >{{ w.title }} <input v-model="w.start" type="time" required /> até
          <input v-model="w.end" type="time" required
        /></label>
      </div>
      <fieldset>
        <legend>Não vou praticar hoje</legend>
        <label v-for="h in habits.data.habits.filter((h) => h.status === 'active')" :key="h.id"
          ><input
            v-model="exception.skipHabitIds"
            type="checkbox"
            :value="h.id"
            @focus="exception.skipHabitIds ??= []"
          />{{ h.name }}</label
        >
        <p>Vale apenas para as sugestões do dia; não altera frequência ou histórico.</p>
      </fieldset>
      <fieldset>
        <legend>Compromisso inesperado ou tempo livre</legend>
        <label>De <input v-model="start" type="time" /></label
        ><label>Até <input v-model="end" type="time" /></label
        ><button type="button" @click="exception.unavailable.push({ start, end })">
          Reservar período
        </button>
        <div v-for="(w, i) in exception.unavailable" :key="i">
          {{ w.start }}–{{ w.end }}
          <button type="button" @click="exception.unavailable.splice(i, 1)">Remover</button>
        </div>
      </fieldset>
      <label
        ><input v-model="updateDefault" type="checkbox" /> Também atualizar acordar e refeições da
        rotina padrão</label
      >
    </template>
    <button class="primary" :disabled="store.blocked">
      Salvar {{ todayOnly ? 'ajustes do dia' : 'rotina' }}
    </button>
    <p v-if="message || store.error" role="status">{{ message || store.error }}</p>
  </form>
</template>
<style scoped>
.routine-settings {
  display: grid;
  gap: 14px;
  max-width: 680px;
  padding: 16px 0;
  font-size: 13px;
}
label {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin: 8px 0;
}
fieldset {
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 12px;
  min-width: 0;
}
input,
button {
  padding: 8px;
  border-radius: 8px;
}
input {
  background: var(--input);
  color: inherit;
  border: 1px solid var(--line);
  max-width: 100%;
}
p {
  color: var(--muted);
  line-height: 1.6;
}
</style>
