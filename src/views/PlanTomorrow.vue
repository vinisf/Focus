<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ArrowUp, ArrowDown, CalendarDays } from 'lucide-vue-next';
import { useAssistant, validTime } from '../stores/assistant';
import type { DayPlan } from '../stores/assistant';
import { useTasks } from '../stores/tasks';
import { useRecommendationContext } from '../composables/useRecommendationContext';
import { addDays, dateKey } from '../utils/dates';
import { planDay } from '../utils/dayPlanner';
import { normalizeActivity, atTime } from '../utils/activityTiming';
import type { ActivityRecommendation } from '../types/recommendations';
import ActivityBadge from '../components/ActivityBadge.vue';
import { routineForDay } from '../utils/routine';
const props = defineProps<{ now: Date }>();
const emit = defineEmits<{
  changed: [message: string];
  editTask: [task: import('../types').Task];
  adjustRoutine: [date: string];
}>();
const assistant = useAssistant(),
  tasks = useTasks();
const tomorrow = computed(() => addDays(dateKey(props.now), 1));
const snapshot = useRecommendationContext(
  () => new Date(tomorrow.value + 'T08:00:00'),
  () => 1440,
);
const draft = ref<DayPlan>({
  date: tomorrow.value,
  start: '08:00',
  end: '18:00',
  unavailable: [],
  entries: [],
});
const activities = ref<ActivityRecommendation[]>([]);
const warnings = ref<string[]>([]);
const message = ref('');
const unavailableStart = ref('12:00'),
  unavailableEnd = ref('13:00');
function refresh(keepSaved = false) {
  if (
    !validTime(draft.value.start) ||
    !validTime(draft.value.end) ||
    draft.value.start >= draft.value.end
  ) {
    message.value = 'O fim do período precisa ser depois do início.';
    return;
  }
  const saved = keepSaved ? assistant.data.plans.find((p) => p.date === tomorrow.value) : undefined;
  if (saved) draft.value = structuredClone(JSON.parse(JSON.stringify(saved)));
  const result = planDay(snapshot.value, {
    date: tomorrow.value,
    start: draft.value.start,
    end: draft.value.end,
    unavailable: draft.value.unavailable,
  });
  activities.value = result.activities;
  warnings.value = result.warnings;
  if (!saved) draft.value = result.plan;
  else {
    const known = new Set(draft.value.entries.map((e) => e.key));
    draft.value.entries.push(...result.plan.entries.filter((e) => !known.has(e.key)));
  }
  message.value = '';
}
watch(
  tomorrow,
  () => {
    draft.value.date = tomorrow.value;
    refresh(true);
  },
  { immediate: true },
);
const routinePreview = computed(() =>
  routineForDay(snapshot.value.routine, new Date(tomorrow.value + 'T12:00:00')),
);
const rows = computed(() =>
  draft.value.entries.flatMap((entry) => {
    const activity = activities.value.find((a) => a.key === entry.key);
    return activity ? [{ entry, activity, normalized: normalizeActivity(activity) }] : [];
  }),
);
function planReason(activity: ActivityRecommendation) {
  if (activity.type === 'task') {
    const task = activity.task;
    if (task.mandatory) return 'Compromisso com horário reservado. Revise se precisar mudar.';
    if (task.dueDate && task.dueDate < tomorrow.value)
      return 'O prazo já passou. Escolha um momento para retomar com calma.';
    if (task.dueDate === tomorrow.value) return 'Esta tarefa vence amanhã e merece atenção.';
    if (task.importance === 'high') return 'Você marcou esta tarefa como importante.';
    if (task.plannedDate === tomorrow.value) return 'Esta tarefa já faz parte do seu planejamento.';
    return 'Uma opção para avançar se houver espaço no dia.';
  }
  if (activity.type === 'iema')
    return activity.ticket.mine
      ? 'Chamado vinculado a você, conforme a última sincronização.'
      : 'Demanda disponível para avaliação, conforme a última sincronização.';
  if (activity.type === 'platform') return activity.platform.nextAction;
  return activity.reason;
}
watch(
  () => [
    snapshot.value.tasks,
    snapshot.value.habits,
    snapshot.value.completions,
    snapshot.value.tickets,
    snapshot.value.platforms,
    snapshot.value.routine,
    snapshot.value.unavailable,
  ],
  () => {
    const result = planDay(snapshot.value, {
      date: tomorrow.value,
      start: draft.value.start,
      end: draft.value.end,
      unavailable: draft.value.unavailable,
    });
    activities.value = result.activities;
    warnings.value = result.warnings;
    const known = new Set(draft.value.entries.map((e) => e.key));
    draft.value.entries.push(...result.plan.entries.filter((e) => !known.has(e.key)));
  },
  { deep: true },
);
function move(key: string, delta: number) {
  const index = draft.value.entries.findIndex((e) => e.key === key),
    next = index + delta;
  if (next < 0 || next >= draft.value.entries.length) return;
  const entries = [...draft.value.entries];
  const currentActivity = activities.value.find((a) => a.key === entries[index]!.key);
  const nextActivity = activities.value.find((a) => a.key === entries[next]!.key);
  if (
    currentActivity &&
    nextActivity &&
    !normalizeActivity(currentActivity).mandatory &&
    !normalizeActivity(nextActivity).mandatory
  ) {
    [entries[index]!.time, entries[next]!.time] = [entries[next]!.time, entries[index]!.time];
  }
  [entries[index], entries[next]] = [entries[next]!, entries[index]!];
  draft.value.entries = entries;
}
function addUnavailable() {
  if (
    !validTime(unavailableStart.value) ||
    !validTime(unavailableEnd.value) ||
    unavailableStart.value >= unavailableEnd.value
  ) {
    message.value = 'Confira o início e o fim da indisponibilidade.';
    return;
  }
  draft.value.unavailable.push({ start: unavailableStart.value, end: unavailableEnd.value });
  refresh();
}
function accept() {
  if (assistant.blocked || tasks.blocked) {
    message.value = assistant.error || tasks.error;
    return;
  }
  const selected = rows.value.filter((r) => r.entry.included);
  const intervals: { start: number; end: number }[] = [];
  for (const { entry, activity, normalized } of selected) {
    if (!entry.date || (entry.time && !validTime(entry.time))) {
      message.value = 'Confira as datas e os horários.';
      return;
    }
    if (
      activity.type === 'task' &&
      activity.task.dueDate >= tomorrow.value &&
      entry.date > activity.task.dueDate
    ) {
      message.value = `Planeje “${activity.title}” até o vencimento. O prazo original foi mantido.`;
      return;
    }
    if (entry.time && entry.date === tomorrow.value) {
      const start = atTime(entry.date, entry.time),
        end = start + (activity.duration ?? 0) * 60000;
      if (
        [...draft.value.unavailable, ...(snapshot.value.restWindows ?? [])].some(
          (i) => start < atTime(entry.date, i.end) && end > atTime(entry.date, i.start),
        ) ||
        intervals.some((i) => start < i.end && end > i.start)
      ) {
        message.value = `O horário de “${activity.title}” se sobrepõe a outro período. Ajuste antes de aceitar.`;
        return;
      }
      if (
        normalized.deadlineAt !== null &&
        normalized.deadlineAt >= atTime(entry.date, '00:00') &&
        end > normalized.deadlineAt
      ) {
        message.value = `A estimativa de “${activity.title}” ultrapassa o horário limite.`;
        return;
      }
      intervals.push({ start, end });
    }
  }
  const previous = JSON.parse(JSON.stringify(assistant.data.plans)) as DayPlan[];
  const plan = JSON.parse(JSON.stringify(draft.value)) as DayPlan;
  if (!assistant.savePlan(plan)) {
    message.value = assistant.error;
    return;
  }
  const edits = selected.flatMap(({ entry, activity }) =>
    activity.type === 'task' ? [{ id: activity.task.id, date: entry.date, time: entry.time }] : [],
  );
  if (!tasks.planMany(edits)) {
    assistant.save({ plans: previous });
    message.value = tasks.error;
    return;
  }
  message.value = 'Planejamento salvo. Você pode ajustar quando precisar.';
  emit('changed', message.value);
}
</script>
<template>
  <details v-if="routinePreview" class="routine-preview">
    <summary>Rotina habitual de amanhã</summary>
    <p>Referências flexíveis; revise somente se precisar.</p>
    <p v-for="w in routinePreview.windows" :key="w.id">{{ w.title }} · {{ w.start }}–{{ w.end }}</p>
    <button class="text-button" @click="$emit('adjustRoutine', tomorrow)">
      Ajustar rotina de amanhã
    </button>
  </details>
  <section class="tomorrow-plan" aria-label="Revisão de amanhã">
    <div class="section-heading">
      <h2>
        <CalendarDays :size="19" />
        {{
          new Date(tomorrow + 'T12:00:00').toLocaleDateString('pt-BR', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })
        }}
      </h2>
    </div>
    <p class="muted">
      Uma proposta com espaço para pausas. Revise os horários e escolha o que faz sentido.
    </p>
    <div class="plan-controls">
      <label>Meu dia começa às<input v-model="draft.start" type="time" /></label>
      <label>Termina às<input v-model="draft.end" type="time" /></label>
      <button @click="refresh()">Sugerir planejamento</button>
    </div>
    <details class="plan-unavailable">
      <summary>Horários indisponíveis</summary>
      <div class="plan-controls">
        <label>De<input v-model="unavailableStart" type="time" /></label
        ><label>Até<input v-model="unavailableEnd" type="time" /></label
        ><button @click="addUnavailable">Reservar período</button>
      </div>
      <div v-for="(interval, index) in draft.unavailable" :key="index" class="plan-controls">
        <span>{{ interval.start }} – {{ interval.end }}</span
        ><button
          @click="
            draft.unavailable.splice(index, 1);
            refresh();
          "
        >
          Remover período
        </button>
      </div>
    </details>
    <p v-for="warning in warnings" :key="warning" class="plan-warning">{{ warning }}</p>
    <p v-if="!rows.length" class="empty-recommend">
      Nada previsto por aqui. O Focus continua sugerindo atividades mesmo sem esta revisão.
    </p>
    <article
      v-for="({ entry, activity, normalized }, index) in rows"
      :key="entry.key"
      class="plan-row"
    >
      <div class="plan-row-title">
        <input
          v-model="entry.included"
          type="checkbox"
          :disabled="normalized.mandatory"
          :aria-label="`Incluir ${activity.title}`"
        />
        <div>
          <ActivityBadge :source="normalized.source" />
          <h3>{{ activity.title }}</h3>
          <span class="muted"
            >{{ normalized.mandatory ? 'Horário obrigatório' : 'Sugestão flexível' }} ·
            {{
              activity.duration === null ? 'Duração desconhecida' : activity.duration + ' min'
            }}</span
          >
          <p v-if="normalized.deadlineAt" class="activity-timing">
            Prazo:
            {{
              new Date(normalized.deadlineAt).toLocaleString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              })
            }}
          </p>
          <p>{{ planReason(activity) }}</p>
        </div>
      </div>
      <div class="plan-controls">
        <label
          >Dia planejado<input
            v-model="entry.date"
            type="date"
            :max="
              activity.type === 'task' && activity.task.dueDate >= tomorrow
                ? activity.task.dueDate
                : undefined
            "
            :disabled="normalized.mandatory"
        /></label>
        <label
          >Início<input v-model="entry.time" type="time" :disabled="normalized.mandatory"
        /></label>
        <button
          :disabled="index === 0"
          :aria-label="`Subir ${activity.title}`"
          @click="move(entry.key, -1)"
        >
          <ArrowUp :size="16" />
        </button>
        <button
          :disabled="index === rows.length - 1"
          :aria-label="`Descer ${activity.title}`"
          @click="move(entry.key, 1)"
        >
          <ArrowDown :size="16" />
        </button>
        <button
          v-if="activity.type === 'task'"
          class="text-button"
          @click="emit('editTask', activity.task)"
        >
          Editar tarefa
        </button>
      </div>
    </article>
    <p v-if="message || assistant.error" role="status">{{ message || assistant.error }}</p>
    <button class="primary" :disabled="assistant.blocked || tasks.blocked" @click="accept">
      Aceitar planejamento
    </button>
  </section>
</template>
