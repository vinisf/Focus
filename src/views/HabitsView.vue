<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Leaf, ChevronLeft, ChevronRight, Plus, Check } from 'lucide-vue-next';
import { useHabits } from '../stores/habits';
import type { Habit } from '../types/habits';
import { addDays } from '../utils/dates';
import {
  datesBetween,
  habitCompliance,
  habitStreak,
  isHabitScheduled,
  weekStart,
  frequencyLabel,
} from '../utils/habits';
import HabitRow from '../components/HabitRow.vue';
import HabitIcon from '../components/HabitIcon.vue';
import HabitTracker from '../components/HabitTracker.vue';
import HabitsToday from '../components/HabitsToday.vue';
import { goalForDate } from '../utils/habitGoals';
import { useTasks } from '../stores/tasks';
const props = defineProps<{ today: string; initialId?: string }>();
const emit = defineEmits<{ create: []; edit: [habit: Habit]; changed: [message: string] }>();
const store = useHabits();
const tasks = useTasks();
const trackingDate = ref(props.today);
const selectedId = ref(
  props.initialId ||
    store.data.habits.find((h) => h.status === 'active')?.id ||
    store.data.habits[0]?.id ||
    '',
);
const archived = ref(false);
const query = ref('');
const month = ref(props.today.slice(0, 7));
watch(
  () => props.initialId,
  (id) => {
    if (id) selectedId.value = id;
  },
);
watch(
  () => store.data.habits.map((h) => h.id),
  () => {
    if (!store.data.habits.some((h) => h.id === selectedId.value))
      selectedId.value = store.data.habits[0]?.id ?? '';
  },
);
const visible = computed(() =>
  store.data.habits.filter(
    (h) =>
      (archived.value || h.status === 'active') &&
      h.name.toLocaleLowerCase().includes(query.value.toLocaleLowerCase()),
  ),
);
const selected = computed(() => store.data.habits.find((h) => h.id === selectedId.value));
watch(selectedId, () => (trackingDate.value = props.today));
const monthStart = computed(() => month.value + '-01');
const monthEnd = computed(() => {
  const d = new Date(monthStart.value + 'T12:00:00');
  d.setMonth(d.getMonth() + 1);
  return addDays(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`, -1);
});
const monthDays = computed(() => datesBetween(monthStart.value, monthEnd.value));
const leading = computed(() => (new Date(monthStart.value + 'T12:00:00').getDay() + 6) % 7);
const monthly = computed(() =>
  selected.value
    ? habitCompliance(
        selected.value,
        store.data.completions,
        monthStart.value,
        monthEnd.value,
        props.today,
      )
    : null,
);
const weekly = computed(() =>
  selected.value
    ? habitCompliance(
        selected.value,
        store.data.completions,
        weekStart(props.today),
        addDays(weekStart(props.today), 6),
        props.today,
      )
    : null,
);
const streak = computed(() =>
  selected.value ? habitStreak(selected.value, store.data.completions, props.today) : null,
);
const history = computed(() =>
  store.data.completions
    .filter((c) => c.habitId === selectedId.value)
    .sort((a, b) => b.date.localeCompare(a.date)),
);
const marked = computed(() => new Set(history.value.map((c) => c.date)));
const partials = computed(() =>
  (store.data.progress ?? [])
    .filter((p) => p.habitId === selectedId.value && !marked.value.has(p.date) && p.value > 0)
    .sort((a, b) => b.date.localeCompare(a.date)),
);
const partialDates = computed(() => new Set(partials.value.map((p) => p.date)));
function changeMonth(offset: number) {
  const date = new Date(monthStart.value + 'T12:00:00');
  date.setMonth(date.getMonth() + offset);
  month.value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}
function toggle(date: string) {
  if (!selected.value) return;
  if (goalForDate(selected.value, date, store.data.completions).kind === 'quantity') {
    trackingDate.value = date;
    return;
  }
  if (store.setCompleted(selected.value.id, date, !marked.value.has(date)))
    emit(
      'changed',
      marked.value.has(date) ? 'Realização registrada no histórico.' : 'Realização desmarcada.',
    );
}
function clear(date: string) {
  if (selected.value && store.setCompleted(selected.value.id, date, false))
    emit('changed', 'Registro do hábito desmarcado.');
}
function label(date: string) {
  const formatted = new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return `${formatted}: ${marked.value.has(date) ? 'realizado' : partialDates.value.has(date) ? 'em progresso' : isHabitScheduled(selected.value!, date) ? 'previsto' : 'não programado'}`;
}
</script>
<template>
  <div class="habits-page">
    <p class="habit-intro">
      Cultive práticas com consistência. Suas entregas continuam na área de tarefas.
    </p>
    <HabitsToday
      :today="today"
      @create="emit('create')"
      @history="selectedId = $event.id"
      @changed="emit('changed', $event)"
    />
    <div class="habit-toolbar">
      <label class="search-box"
        ><Leaf :size="16" /><input
          v-model="query"
          placeholder="Buscar hábito…"
          aria-label="Buscar hábitos" /></label
      ><label class="archive-filter"
        ><input v-model="archived" type="checkbox" />Mostrar arquivados</label
      ><button class="primary" :disabled="store.blocked" @click="emit('create')">
        <Plus :size="15" />Novo hábito
      </button>
    </div>
    <div class="habits-layout">
      <section class="habit-management" aria-label="Seus hábitos">
        <div class="section-heading">
          <h2>
            Seus hábitos <span class="count-pill">{{ visible.length }}</span>
          </h2>
        </div>
        <div class="habit-list">
          <div
            v-for="habit in visible"
            :key="habit.id"
            :class="{ 'selected-habit': selectedId === habit.id }"
          >
            <HabitRow
              :habit="habit"
              :date="today"
              manage
              @edit="emit('edit', $event)"
              @history="selectedId = $event.id"
              @changed="emit('changed', $event)"
            />
          </div>
          <div v-if="!visible.length" class="habit-empty">
            <Leaf :size="24" />
            <p>
              {{ query ? 'Não encontramos esse hábito.' : 'Um hábito pode começar pequeno.' }}
            </p>
            <span>{{
              query ? 'Que tal tentar outro nome?' : 'Escolha uma prática para cuidar no seu ritmo.'
            }}</span>
          </div>
        </div>
      </section>
      <section v-if="selected" class="habit-history" aria-labelledby="habit-history-title">
        <div class="habit-history-heading">
          <span class="habit-symbol"><HabitIcon :name="selected.icon" :size="22" /></span>
          <div>
            <h2 id="habit-history-title">{{ selected.name }}</h2>
            <p>{{ frequencyLabel(selected.frequency) }}</p>
          </div>
        </div>
        <p v-if="selected.description" class="habit-description">{{ selected.description }}</p>
        <dl class="habit-definition">
          <div>
            <dt>Meta</dt>
            <dd>
              {{
                selected.goal?.description ||
                (selected.goal?.kind === 'quantity'
                  ? `${selected.goal.target} ${selected.goal.unit} por realização`
                  : 'Marcar como feito')
              }}
            </dd>
          </div>
          <div>
            <dt>Frequência</dt>
            <dd>{{ frequencyLabel(selected.frequency) }}</dd>
          </div>
          <div v-if="selected.categoryId">
            <dt>Categoria</dt>
            <dd>
              {{
                tasks.data.categories.find((c) => c.id === selected!.categoryId)?.name ??
                'Sem categoria'
              }}
            </dd>
          </div>
          <div v-if="selected.preferredTime">
            <dt>Horário preferencial</dt>
            <dd>{{ selected.preferredTime }}</dd>
          </div>
          <div>
            <dt>Acompanhamento</dt>
            <dd>
              {{
                selected.goal?.kind === 'quantity' ? 'Quantidade realizada' : 'Feito / Não feito'
              }}
            </dd>
          </div>
        </dl>
        <div class="habit-metrics">
          <article>
            <span>Nesta semana</span
            ><strong>{{ weekly?.percent === null ? '—' : weekly?.percent + '%' }}</strong
            ><small>{{
              weekly?.expected
                ? `${weekly.done} de ${weekly.expected} previstos`
                : 'Sem previsão no período'
            }}</small>
          </article>
          <article>
            <span>No mês exibido</span
            ><strong>{{ monthly?.percent === null ? '—' : monthly?.percent + '%' }}</strong
            ><small>{{
              monthly?.expected
                ? `${monthly.done} de ${monthly.expected} previstos`
                : 'Sem previsão no período'
            }}</small>
          </article>
          <article>
            <span>{{ streak === null ? 'Meta flexível' : 'Sequência atual' }}</span
            ><strong>{{ streak === null ? 'Semanal' : streak }}</strong
            ><small>{{
              streak === null ? 'Sem sequência diária' : 'dias previstos cumpridos'
            }}</small>
          </article>
        </div>
        <div class="calendar-heading">
          <button class="icon-button" aria-label="Mês anterior" @click="changeMonth(-1)">
            <ChevronLeft :size="19" />
          </button>
          <h3>
            {{
              new Date(monthStart + 'T12:00:00').toLocaleDateString('pt-BR', {
                month: 'long',
                year: 'numeric',
              })
            }}
          </h3>
          <button
            class="icon-button"
            aria-label="Próximo mês"
            :disabled="month >= today.slice(0, 7)"
            @click="changeMonth(1)"
          >
            <ChevronRight :size="19" />
          </button>
        </div>
        <div class="habit-calendar" aria-label="Calendário de consistência">
          <span
            v-for="day in ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']"
            :key="day"
            class="calendar-weekday"
            >{{ day }}</span
          ><span v-for="n in leading" :key="'blank' + n" /><button
            v-for="date in monthDays"
            :key="date"
            :class="{
              marked: marked.has(date),
              scheduled: isHabitScheduled(selected, date),
              rest: !isHabitScheduled(selected, date),
              today: date === today,
              partial: partialDates.has(date),
              'tracking-selected':
                goalForDate(selected, date, store.data.completions).kind === 'quantity' &&
                date === trackingDate,
            }"
            :disabled="
              store.blocked ||
              date > today ||
              (!isHabitScheduled(selected, date) && !marked.has(date) && !partialDates.has(date))
            "
            :aria-label="label(date)"
            :aria-pressed="marked.has(date)"
            @click="toggle(date)"
          >
            <span>{{ Number(date.slice(-2)) }}</span
            ><Check v-if="marked.has(date)" :size="11" /><i
              v-else-if="isHabitScheduled(selected, date)"
            />
          </button>
        </div>
        <div
          v-if="
            goalForDate(selected, trackingDate, store.data.completions).kind === 'quantity' &&
            (isHabitScheduled(selected, trackingDate) ||
              marked.has(trackingDate) ||
              partialDates.has(trackingDate)) &&
            trackingDate <= today
          "
          class="habit-date-tracker"
        >
          <label
            >Progresso em
            {{ new Date(trackingDate + 'T12:00:00').toLocaleDateString('pt-BR') }}</label
          >
          <p v-if="goalForDate(selected, trackingDate, store.data.completions).description">
            {{ goalForDate(selected, trackingDate, store.data.completions).description }}
          </p>
          <HabitTracker :habit="selected" :date="trackingDate" @changed="emit('changed', $event)" />
        </div>
        <p class="calendar-note">
          Clique em um dia previsto para marcar, desmarcar ou registrar a quantidade realizada. Dias
          de descanso não contam como faltas. Metas semanais permitem escolher os dias.
        </p>
        <details class="habit-records">
          <summary>Histórico de realizações ({{ history.length }})</summary>
          <ul v-if="history.length">
            <li v-for="record in history" :key="record.id">
              <span>{{ new Date(record.date + 'T12:00:00').toLocaleDateString('pt-BR') }}</span
              ><span v-if="record.goal?.kind === 'quantity'" class="habit-record-goal"
                >{{ record.value }} / {{ record.goal.target }} {{ record.goal.unit
                }}<small>{{ record.goal.description }}</small></span
              ><span v-else-if="record.goal?.description" class="habit-record-goal">{{
                record.goal.description
              }}</span
              ><button :disabled="store.blocked" @click="clear(record.date)">Desmarcar</button>
            </li>
          </ul>
          <p v-else>Ainda não há realizações registradas.</p>
        </details>
        <details v-if="partials.length" class="habit-records">
          <summary>Em progresso ({{ partials.length }})</summary>
          <ul>
            <li v-for="record in partials" :key="record.date">
              <button @click="trackingDate = record.date">
                {{ new Date(record.date + 'T12:00:00').toLocaleDateString('pt-BR') }} ·
                {{ record.value }} registrados</button
              ><button :disabled="store.blocked" @click="clear(record.date)">Limpar</button>
            </li>
          </ul>
        </details>
      </section>
    </div>
  </div>
</template>
