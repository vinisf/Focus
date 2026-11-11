<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { X } from 'lucide-vue-next';
import { habitIcons, type Habit, type HabitFrequency, type HabitGoal } from '../types/habits';
import { defaultHabitGoal } from '../utils/habitGoals';
import { useHabits } from '../stores/habits';
import { useTasks } from '../stores/tasks';
import { useDialogFocus } from '../composables/useDialogFocus';
import { dateKey } from '../utils/dates';
import HabitIcon from './HabitIcon.vue';
import DeleteActivity from './DeleteActivity.vue';
const props = defineProps<{ habit: Habit | null }>();
const emit = defineEmits<{ close: []; saved: []; deleted: [] }>();
const store = useHabits();
const tasks = useTasks();
const input = ref<HTMLInputElement>();
const { trapFocus } = useDialogFocus(input);
const createdAt = new Date().toISOString();
const form = reactive<Habit>(
  props.habit
    ? (JSON.parse(JSON.stringify(props.habit)) as Habit)
    : {
        id: crypto.randomUUID(),
        name: '',
        description: '',
        categoryId: null,
        icon: 'leaf',
        frequency: { kind: 'daily' },
        preferredTime: '',
        createdAt,
        status: 'active',
        plans: [{ from: dateKey(new Date(createdAt)), frequency: { kind: 'daily' }, active: true }],
      },
);
const kind = ref(form.frequency.kind);
const days = ref(form.frequency.kind === 'weekdays' ? [...form.frequency.days] : [1, 2, 3, 4, 5]);
const target = ref(form.frequency.kind === 'weekly' ? form.frequency.target : 3);
const goalDescription = ref(form.goal?.description ?? '');
const tracking = ref(form.goal?.kind ?? 'check');
const quantity = ref(form.goal?.kind === 'quantity' ? form.goal.target : 3);
const unit = ref(form.goal?.kind === 'quantity' ? form.goal.unit : '');
const error = ref('');
function remove() {
  if (props.habit && store.remove(props.habit.id)) emit('deleted');
  else error.value = store.error || 'Não foi possível excluir o hábito.';
}
const valid = computed(
  () =>
    !!form.name.trim() &&
    (tracking.value !== 'quantity' ||
      (Number.isFinite(quantity.value) &&
        quantity.value > 0 &&
        quantity.value <= 1e9 &&
        !!unit.value.trim())) &&
    (kind.value !== 'weekdays' || days.value.length > 0) &&
    (kind.value !== 'weekly' ||
      (Number.isInteger(target.value) && target.value >= 1 && target.value <= 7)),
);
const iconNames = {
  leaf: 'Folha',
  dumbbell: 'Treino',
  book: 'Leitura',
  droplets: 'Água',
  heart: 'Cuidado',
  sun: 'Sol',
};
function submit() {
  if (!valid.value) return;
  if (typeof form.duration !== 'number') delete form.duration;
  if (typeof form.minIntervalHours !== 'number') delete form.minIntervalHours;
  const frequency: HabitFrequency =
    kind.value === 'daily'
      ? { kind: 'daily' }
      : kind.value === 'weekly'
        ? { kind: 'weekly', target: target.value }
        : { kind: 'weekdays', days: [...days.value].sort() };
  if (form.duration === ('' as unknown)) delete form.duration;
  if (form.minIntervalHours === ('' as unknown)) delete form.minIntervalHours;
  form.frequency = frequency;
  const goal: HabitGoal =
    tracking.value === 'quantity'
      ? {
          kind: 'quantity',
          description: goalDescription.value.trim(),
          target: quantity.value,
          unit: unit.value.trim(),
        }
      : { ...defaultHabitGoal(), description: goalDescription.value.trim() };
  form.goal = goal;
  if (!props.habit)
    form.plans = [{ from: dateKey(new Date(form.createdAt)), frequency, active: true, goal }];
  if (store.save(form)) emit('saved');
  else error.value = 'Não foi possível salvar. Verifique os campos e o armazenamento de hábitos.';
}
</script>
<template>
  <div class="overlay" @click.self="emit('close')" @keydown.esc="emit('close')">
    <section
      class="modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="habit-editor-title"
      @keydown.tab="trapFocus"
    >
      <header>
        <h2 id="habit-editor-title">
          {{ habit ? 'Editar hábito' : 'Um hábito, um dia de cada vez' }}
        </h2>
        <button aria-label="Fechar" @click="emit('close')"><X :size="20" /></button>
      </header>
      <form @submit.prevent="submit">
        <label
          >Nome do hábito<input
            ref="input"
            v-model="form.name"
            required
            maxlength="180"
            placeholder="Qual prática você quer cultivar?"
        /></label>
        <label
          >Meta <small>O que você precisa realizar para considerar o hábito cumprido</small
          ><input
            v-model="goalDescription"
            maxlength="240"
            placeholder="Ex.: Ler 3 capítulos da Bíblia"
            aria-label="Meta do hábito"
        /></label>
        <label
          >Tipo de acompanhamento<select v-model="tracking" aria-label="Tipo de acompanhamento">
            <option value="check">Feito / Não feito</option>
            <option value="quantity">Quantidade realizada</option>
          </select></label
        >
        <div v-if="tracking === 'quantity'" class="form-grid">
          <label
            >Quantidade por realização<input
              v-model.number="quantity"
              type="number"
              min="0.001"
              max="1000000000"
              step="any"
              required
              aria-label="Quantidade da meta" /></label
          ><label
            >Unidade<input
              v-model="unit"
              required
              maxlength="40"
              placeholder="Ex.: capítulos, páginas, litros"
              aria-label="Unidade da meta"
          /></label>
        </div>
        <label
          >Descrição <small>Opcional</small><textarea v-model="form.description" rows="2" />
        </label>
        <fieldset class="habit-icon-picker">
          <legend>Ícone</legend>
          <button
            v-for="icon in habitIcons"
            :key="icon"
            type="button"
            :aria-label="iconNames[icon]"
            :aria-pressed="form.icon === icon"
            :class="{ chosen: form.icon === icon }"
            @click="form.icon = icon"
          >
            <HabitIcon :name="icon" />
          </button>
        </fieldset>
        <div class="form-grid">
          <label
            >Categoria <small>Opcional</small
            ><select v-model="form.categoryId">
              <option :value="null">Sem categoria</option>
              <option
                v-for="category in tasks.data.categories"
                :key="category.id"
                :value="category.id"
              >
                {{ category.name }}
              </option>
            </select></label
          ><label
            >Horário preferencial <small>Opcional</small
            ><input v-model="form.preferredTime" type="time"
          /></label>
        </div>
        <div class="form-grid">
          <label
            >Duração estimada (min)<input
              v-model.number="form.duration"
              type="number"
              min="1"
              max="10080"
          /></label>
          <label
            >Intervalo mínimo (horas)<input
              v-model.number="form.minIntervalHours"
              type="number"
              min="0"
              max="8760"
              step="0.5"
          /></label>
          <label
            >Intensidade<select v-model="form.intensity">
              <option :value="undefined">Não informada</option>
              <option value="light">Leve</option>
              <option value="moderate">Moderada</option>
              <option value="high">Alta</option>
            </select></label
          >
          <label
            >Esforço<select v-model="form.effort">
              <option :value="undefined">Não informado</option>
              <option value="physical">Físico</option>
              <option value="mental">Mental</option>
              <option value="other">Outros</option>
            </select></label
          >
        </div>
        <label class="day-choice"
          ><input v-model="form.allowMultipleSessions" type="checkbox" />Permitir várias sessões no
          dia para atingir a meta</label
        >
        <p class="habit-form-note">
          A meta satisfeita encerra as sugestões. Metas semanais contam dias distintos. O intervalo
          informado também evita sugestões de alto esforço da mesma categoria após outra prática
          intensa.
        </p>
        <label
          >Frequência<select v-model="kind" aria-label="Frequência do hábito">
            <option value="daily">Diária</option>
            <option value="weekdays">Dias específicos</option>
            <option value="weekly">Vezes por semana</option>
          </select></label
        >
        <fieldset v-if="kind === 'weekdays'">
          <legend>Escolha pelo menos um dia</legend>
          <label
            v-for="(day, index) in ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']"
            :key="day"
            class="day-choice"
            ><input v-model="days" type="checkbox" :value="index" />{{ day }}</label
          >
        </fieldset>
        <label v-if="kind === 'weekly'"
          >Realizações por semana<input
            v-model.number="target"
            type="number"
            min="1"
            max="7"
            required
            aria-label="Meta semanal"
          /><small>Escolha os dias livremente. Cada dia conta uma vez para a meta.</small></label
        >
        <p class="habit-form-note">
          A frequência define quando praticar. A meta define o que cumprir em cada realização.
          Hábitos não entram na produtividade das tarefas.
        </p>
        <DeleteActivity
          v-if="habit"
          label="Excluir hábito"
          :description="`Excluir “${habit.name}” e todo o seu histórico de realizações, progresso e sessões? Para preservar o histórico, use Arquivar.`"
          :disabled="store.blocked"
          @confirm="remove"
        />
        <p v-if="error" role="alert" class="late">{{ error }}</p>
        <footer>
          <button type="button" @click="emit('close')">Cancelar</button
          ><button class="primary" :disabled="!valid || store.blocked">Salvar hábito</button>
        </footer>
      </form>
    </section>
  </div>
</template>
