<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoutine } from '../stores/routine';
import { useFocusExecution } from '../stores/focusExecution';
import { criticalToken } from '../utils/activityTiming';
import { Sparkles, Play, Check, Clock3, Coffee } from 'lucide-vue-next';
import { useIema } from '../stores/iema';
import { useTasks } from '../stores/tasks';
import { useHabits } from '../stores/habits';
import { usePlatforms } from '../stores/platforms';
import { usePlanning } from '../stores/planning';
import { useRecommendationContext } from '../composables/useRecommendationContext';
import { useAssistant } from '../stores/assistant';
import { recommendationEngine, newRound } from '../services/RecommendationEngine';
import { dateKey } from '../utils/dates';
import { normalizeActivity } from '../utils/activityTiming';
import PlatformCard from './PlatformCard.vue';
import WorkSessionPanel from './WorkSessionPanel.vue';
import type { ActivitySource } from '../types/planning';
import type { ActivityFilter, ActivityRecommendation, Deferral } from '../types/recommendations';
import type { Task } from '../types';
import type { Habit } from '../types/habits';
import ActivityBadge from './ActivityBadge.vue';
import { nextActionReason } from '../utils/uiCopy';
import { isAvailableToday } from '../utils/priority';
import { eligibleHabit } from '../utils/recommendations';
const props = defineProps<{ now: Date; compact?: boolean; settingsOnly?: boolean }>();
const minutes = defineModel<number>('minutes', { required: true });
const emit = defineEmits<{
  editTask: [task: Task];
  editHabit: [habit: Habit];
  changed: [message: string];
}>();
const routine = useRoutine();
const execution = useFocusExecution();
const elapsed = computed(() =>
  execution.current
    ? Math.floor(
        (execution.current.elapsed +
          (execution.current.since === null
            ? 0
            : Math.max(0, props.now.getTime() - execution.current.since))) /
          1000,
      )
    : 0,
);
function begin(activity: ActivityRecommendation) {
  if (activity.type === 'routine') return;
  if (
    !execution.start(
      { key: activity.key, title: activity.title, type: activity.type },
      props.now.getTime(),
    )
  ) {
    emit('changed', execution.error || 'Encerre o foco atual antes de começar outro.');
    return;
  }
  if (
    activity.type === 'iema' ||
    activity.type === 'platform' ||
    (activity.type === 'task' &&
      (activity.task.integrationName ||
        planning.data.preferences.workCategoryIds.includes(activity.task.categoryId)))
  ) {
    if (
      !planning.start(
        activity.key,
        activity.type === 'task' ? 'task' : activity.type,
        props.now,
        activity.duration,
      )
    ) {
      execution.clear();
      emit('changed', planning.error);
    }
  }
}
function pauseFocus() {
  if (!execution.pause(props.now.getTime())) return;
  if (planning.running?.key === execution.current?.key) planning.stop(props.now);
}
function leaveFocus() {
  if (planning.running?.key === execution.current?.key && !planning.stop(props.now)) return;
  execution.clear();
}
function resumeFocus() {
  const focus = execution.current;
  if (!focus) return;
  const task = tasks.data.tasks.find((t) => `task:${t.id}` === focus.key);
  const professional =
    focus.type === 'iema' ||
    focus.type === 'platform' ||
    (task &&
      (task.integrationName ||
        planning.data.preferences.workCategoryIds.includes(task.categoryId)));
  if (
    professional &&
    !planning.start(
      focus.key,
      focus.type === 'platform' ? 'platform' : focus.type === 'iema' ? 'iema' : 'task',
      props.now,
      0,
    )
  ) {
    emit('changed', planning.error);
    return;
  }
  execution.resume(props.now.getTime());
}
function finishFocus() {
  const focus = execution.current;
  if (!focus) return;
  if (focus.type === 'task') {
    const task = tasks.data.tasks.find((t) => `task:${t.id}` === focus.key);
    if (tasks.blocked) return;
    if (task && task.status !== 'done') {
      tasks.status(task, 'done');
      if (tasks.error) return;
    }
  } else if (focus.type === 'habit') {
    const habit = habits.data.habits.find((h) => `habit:${h.id}` === focus.key);
    if (habit && !habits.recordSession(habit.id, amount.value, props.now)) {
      emit('changed', habits.error || 'Confira a quantidade realizada.');
      return;
    }
  }
  if (planning.running?.key === focus.key && !planning.stop(props.now)) return;
  if (execution.clear())
    emit(
      'changed',
      focus.type === 'task'
        ? 'Tarefa concluída.'
        : focus.type === 'habit'
          ? 'Sessão do hábito registrada.'
          : 'Sessão encerrada.',
    );
}
const selectedKey = ref('');
const tasks = useTasks();
const iema = useIema();
const habits = useHabits();
const platforms = usePlatforms();
const planning = usePlanning();
const assistant = useAssistant();
const focusTitle = computed(() => {
  const focus = execution.current;
  if (!focus) return '';
  if (focus.type === 'task')
    return tasks.data.tasks.find((t) => `task:${t.id}` === focus.key)?.title ?? focus.title;
  if (focus.type === 'habit')
    return habits.data.habits.find((h) => `habit:${h.id}` === focus.key)?.name ?? focus.title;
  if (focus.type === 'iema')
    return iema.recommendations.find((t) => t.key === focus.key)?.title ?? focus.title;
  return focus.title;
});
const sources: Record<ActivitySource, string> = {
  routine: 'Minha rotina',
  task: 'Tarefa pessoal',
  habit: 'Hábito',
  iema: 'IEMA',
  platform: 'Integrações',
};
const selectedPlatformKey = ref('');
const selectedPlatform = computed(() =>
  platforms.data.platforms.find((p) => p.key === selectedPlatformKey.value),
);
function sourceToggle(source: ActivitySource) {
  const excluded = planning.data.preferences.excludedSources;
  planning.preferences({
    excludedSources: excluded.includes(source)
      ? excluded.filter((s) => s !== source)
      : [...excluded, source],
  });
}
function categoryToggle(id: string, field: 'categoryIds' | 'workCategoryIds') {
  const values = planning.data.preferences[field];
  planning.preferences({
    [field]: values.includes(id) ? values.filter((v) => v !== id) : [...values, id],
  });
}
const filter = ref<ActivityFilter>('all');
const amount = ref(1);
const deferred = ref<Deferral[]>([]);
const round = ref(assistant.data.round ?? newRound(dateKey(props.now)));
const freeUntil = ref('');
const roundMessage = ref('');
const suggestBreak = computed(() =>
  planning.data.sessions.some(
    (s) =>
      s.endedAt &&
      Date.parse(s.endedAt) - Date.parse(s.startedAt) >= 60 * 60000 &&
      props.now.getTime() >= Date.parse(s.endedAt) &&
      props.now.getTime() - Date.parse(s.endedAt) < 15 * 60000,
  ),
);
try {
  const raw: unknown = JSON.parse(localStorage.getItem('focus.recommendations.v1') ?? '[]');
  if (Array.isArray(raw))
    deferred.value = raw.filter((d) => d && typeof d.key === 'string' && Number.isFinite(d.until));
} catch {
  /* Deferrals are optional; activity history remains independent. */
}
watch(
  deferred,
  (value) => {
    try {
      localStorage.setItem('focus.recommendations.v1', JSON.stringify(value));
    } catch {
      emit('changed', 'O adiamento vale nesta sessão; não foi possível salvá-lo.');
    }
  },
  { deep: true },
);
const snapshot = useRecommendationContext(
  () => props.now,
  () => Number(minutes.value),
  () => freeUntil.value,
);
const context = computed(() => ({
  ...snapshot.value,
  filter: filter.value,
  deferred: [...(snapshot.value.deferred ?? []), ...deferred.value],
}));
const result = computed(() => recommendationEngine.recommend(context.value, round.value));
watch(
  () => result.value.restarted,
  (restarted) => {
    if (restarted && !props.settingsOnly) updateRound(result.value.round, true);
  },
);
function updateRound(next: typeof round.value, restarted = false) {
  round.value = next;
  if (!assistant.save({ round: next })) emit('changed', assistant.error);
  roundMessage.value = restarted
    ? 'Você já percorreu as sugestões. Vamos revisar as prioridades.'
    : '';
}
const main = computed(() => {
  const first = result.value.activities[0];
  if (first && criticalToken(first, context.value)) return first;
  return result.value.activities.find((a) => a.key === selectedKey.value) ?? first;
});
const otherActivities = computed(() =>
  result.value.activities.filter((a) => a.key !== main.value?.key).slice(0, 2),
);
function choose(activity: ActivityRecommendation) {
  if (main.value && criticalToken(main.value, context.value)) return;
  selectedKey.value = activity.key;
}
const humanReason = computed(() =>
  main.value ? nextActionReason(main.value, props.now, Number(minutes.value)) : '',
);
const paused = computed(
  () =>
    !!context.value.preferences?.restUntil &&
    context.value.preferences.restUntil > props.now.getTime(),
);
const hasPendingTasks = computed(
  () =>
    tasks.data.tasks.some(
      (t) => ['pending', 'active'].includes(t.status) && isAvailableToday(t, props.now),
    ) ||
    snapshot.value.habits.some((h) => eligibleHabit(h, { ...context.value, minutes: 10080 })) ||
    (snapshot.value.tickets?.length ?? 0) > 0,
);
const compactEmptyTitle = computed(() =>
  paused.value
    ? 'Um tempo para você.'
    : hasPendingTasks.value
      ? 'Por agora, vá com calma.'
      : 'Você está em dia por aqui.',
);
const compactEmptyMessage = computed(() =>
  paused.value
    ? 'Suas sugestões voltam quando você quiser retomar.'
    : hasPendingTasks.value
      ? 'Nenhuma sugestão cabe neste momento. Você pode ajustar o tempo ou voltar depois.'
      : 'Quando surgir uma tarefa, a gente organiza o próximo passo.',
);
watch(
  () => main.value?.key,
  () => {
    amount.value = 1;
  },
);
function skip(activity: ActivityRecommendation) {
  selectedKey.value = '';
  if (activity.type === 'routine') {
    if (
      !routine.respond(
        activity.routine.id,
        dateKey(props.now),
        false,
        props.now.getTime() + 30 * 60000,
      )
    )
      emit('changed', routine.error);
    return;
  }
  const next = recommendationEngine.skip(activity, context.value, result.value.round);
  updateRound(next.round, next.restarted);
  if (!next.restarted) emit('changed', 'Sugestão pulada. Datas e status continuam iguais.');
}

function act(activity: ActivityRecommendation) {
  if (activity.type === 'routine') {
    if (!routine.respond(activity.routine.id, dateKey(props.now), true, props.now.getTime()))
      emit('changed', routine.error);
    return;
  }
  if (activity.type === 'platform') {
    selectedPlatformKey.value = activity.platform.key;
    return;
  }
  if (activity.type === 'iema') {
    void iema.open(activity.ticket);
    return;
  }
  if (activity.type === 'task') {
    const done = activity.task.status === 'active';
    if (done && planning.running?.key === activity.key) planning.stop();
    if (tasks.blocked) return;
    tasks.status(activity.task, done ? 'done' : 'active');
    if (tasks.error) return;
    if (!done) begin(activity);
    emit(
      'changed',
      done ? 'Tarefa concluída. Cada passo conta!' : 'Tarefa em andamento. Um passo de cada vez.',
    );
  } else if (habits.recordSession(activity.habit.id, amount.value, props.now)) {
    emit('changed', 'Sessão do hábito registrada. Cada passo conta!');
  } else emit('changed', 'Não foi possível registrar a sessão. Confira a meta e o armazenamento.');
}
</script>
<template>
  <section
    class="recommendation"
    :class="{ 'recommendation-compact': compact, 'recommendation-settings': settingsOnly }"
  >
    <div v-if="!compact && !settingsOnly" class="recommendation-top">
      <span class="recommend-label"><Sparkles :size="16" /> UM POUCO DE CLAREZA</span
      ><span class="rule-label">Feito para o seu momento</span>
    </div>
    <details v-if="!compact" class="planning-options" :open="settingsOnly">
      <summary>Equilibrar meu planejamento</summary>
      <label
        >Limite de trabalho por dia (minutos; vazio = sem limite configurado)<input
          type="number"
          min="0"
          max="1440"
          :value="planning.data.preferences.maxWorkMinutes ?? ''"
          @change="
            planning.preferences({
              maxWorkMinutes: ($event.target as HTMLInputElement).value.trim()
                ? Number(($event.target as HTMLInputElement).value)
                : null,
            })
          "
      /></label>
      <label
        >Preferência de duração<select
          :value="planning.data.preferences.style"
          @change="
            planning.preferences({
              style: ($event.target as HTMLSelectElement).value as 'any' | 'quick' | 'deep',
            })
          "
        >
          <option value="any">Sem preferência</option>
          <option value="quick">Rápidas (até 30 min)</option>
          <option value="deep">Sessões longas (45 min ou mais)</option>
        </select></label
      >
      <p>
        A preferência usa apenas a duração informada, sem presumir complexidade. Com limite de
        trabalho configurado, atividades profissionais sem estimativa ficam fora das sugestões.
      </p>
      <fieldset>
        <legend>Fontes consideradas (desmarque para excluir temporariamente)</legend>
        <label v-for="(label, source) in sources" :key="source" class="planning-check"
          ><input
            type="checkbox"
            :checked="!planning.data.preferences.excludedSources.includes(source)"
            @change="sourceToggle(source)"
          />{{ label }}</label
        >
      </fieldset>
      <fieldset>
        <legend>Categorias de tarefas e hábitos (nenhuma marcada = todas)</legend>
        <label v-for="category in tasks.data.categories" :key="category.id" class="planning-check"
          ><input
            type="checkbox"
            :checked="planning.data.preferences.categoryIds.includes(category.id)"
            @change="categoryToggle(category.id, 'categoryIds')"
          />{{ category.name }}</label
        >
      </fieldset>
      <fieldset>
        <legend>Quais categorias pessoais contam como trabalho?</legend>
        <label v-for="category in tasks.data.categories" :key="category.id" class="planning-check"
          ><input
            type="checkbox"
            :checked="planning.data.preferences.workCategoryIds.includes(category.id)"
            @change="categoryToggle(category.id, 'workCategoryIds')"
          />{{ category.name }}</label
        >
      </fieldset>
      <p>
        IEMA e plataformas sempre contam como trabalho. Hábitos mantêm seus indicadores
        independentes. As exclusões de fontes ficam salvas até você reativá-las.
      </p>
    </details>
    <template v-if="!settingsOnly">
      <p v-if="suggestBreak && !paused" class="round-notice">
        Você encerrou uma sessão longa. Que tal uma pausa?<button
          class="text-button"
          @click="planning.preferences({ restUntil: now.getTime() + 10 * 60000 })"
        >
          Pausar 10 min
        </button>
      </p>
      <WorkSessionPanel v-if="!execution.current && (!compact || planning.running)" :now="now" />
      <button
        v-if="!compact"
        class="text-button"
        @click="planning.preferences({ restUntil: now.getTime() + 30 * 60000 })"
      >
        Descansar por 30 minutos
      </button>
      <button
        v-if="
          planning.data.preferences.restUntil && planning.data.preferences.restUntil > now.getTime()
        "
        class="text-button"
        @click="planning.preferences({ restUntil: null })"
      >
        Retomar sugestões
      </button>
      <section
        v-if="execution.current"
        class="suggested-task focus-current"
        aria-label="Atividade em foco"
      >
        <p>Seu foco agora</p>
        <h2>{{ focusTitle }}</h2>
        <label
          ><input
            type="checkbox"
            :checked="routine.data.timer"
            @change="routine.save({ timer: ($event.target as HTMLInputElement).checked })"
          />
          Cronômetro opcional</label
        >
        <p v-if="routine.data.timer">{{ Math.floor(elapsed / 60) }} min {{ elapsed % 60 }} s</p>
        <label v-if="execution.current.type === 'habit'"
          >Quantidade realizada <input v-model.number="amount" type="number" min="0.001" step="any"
        /></label>
        <div class="suggestion-actions">
          <button v-if="execution.current.since !== null" @click="pauseFocus">Pausar</button
          ><button v-else @click="resumeFocus">Continuar</button
          ><button class="primary" @click="finishFocus">
            {{
              ['iema', 'platform'].includes(execution.current.type) ? 'Encerrar sessão' : 'Concluir'
            }}
          </button>
        </div>
        <button v-if="execution.current.since === null" class="text-button" @click="leaveFocus">
          Voltar às sugestões sem concluir
        </button>
        <p v-if="['iema', 'platform'].includes(execution.current.type)">
          O status profissional é atualizado na origem.
        </p>
      </section>
      <p v-if="execution.error" role="alert">{{ execution.error }}</p>
      <div v-if="!execution.current" class="recommend-layout">
        <p v-if="roundMessage" class="round-notice" role="status">{{ roundMessage }}</p>
        <div class="recommend-intro">
          <div class="next-action-heading">
            <span v-if="compact" class="next-action-eyebrow"
              ><Sparkles :size="13" aria-hidden="true" />PRÓXIMA AÇÃO</span
            >
            <h2>Minha Única Coisa</h2>
          </div>
          <p v-if="!compact">Escolha seu tempo. A gente ajuda a encontrar o próximo passo.</p>
          <label v-if="compact" class="compact-time"
            >Seu tempo agora
            <span
              ><input
                v-model.number="minutes"
                type="number"
                min="1"
                max="10080"
                aria-label="Tempo personalizado em minutos"
              />
              min</span
            ></label
          >
          <details class="free-until">
            <summary>Livre até um horário?</summary>
            <label>Estou livre até<input v-model="freeUntil" type="time" /></label
            ><button class="text-button" @click="freeUntil = ''">Limpar horário</button>
          </details>
          <div v-if="!compact" class="time-options">
            <button
              v-for="n in [15, 30, 60, 120]"
              :key="n"
              :class="{ chosen: minutes === n }"
              @click="minutes = n"
            >
              {{ n < 60 ? n + ' min' : n / 60 + ' h' }}</button
            ><label class="custom-time"
              ><input
                v-model.number="minutes"
                type="number"
                min="1"
                max="10080"
                aria-label="Tempo personalizado em minutos"
              />
              min</label
            >
          </div>
          <label v-if="!compact" class="activity-filter"
            >Recomendar<select v-model="filter" aria-label="Filtrar recomendações">
              <option value="all">Todas as atividades</option>
              <option value="task">Somente tarefas pessoais</option>
              <option value="iema">Somente chamados IEMA</option>
              <option value="habit">Somente hábitos</option>
              <option value="platform">Somente integrações</option>
            </select></label
          >
        </div>
        <div v-if="main" class="suggested-task" aria-live="polite">
          <div class="suggested-tag">
            <ActivityBadge
              :source="main.type === 'task' && main.task.integrationName ? 'platform' : main.type"
            />
            <span class="duration"
              ><Clock3 :size="12" :stroke-width="1.7" aria-hidden="true" />{{
                main.duration === null ? 'Sem estimativa' : main.duration + ' min'
              }}</span
            >
          </div>
          <h3>{{ main.title }}</h3>
          <p
            v-if="normalizeActivity(main).nextAction !== main.title && main.type === 'task'"
            class="activity-timing"
          >
            Próxima ação: {{ normalizeActivity(main).nextAction }}
          </p>
          <p class="suggestion-reason">{{ humanReason }}</p>
          <p v-if="normalizeActivity(main).deadlineAt" class="activity-timing">
            Prazo:
            {{
              new Date(normalizeActivity(main).deadlineAt!).toLocaleString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              })
            }}
          </p>
          <p v-if="normalizeActivity(main).scheduledAt" class="activity-timing">
            Início:
            {{
              new Date(normalizeActivity(main).scheduledAt!).toLocaleTimeString('pt-BR', {
                hour: '2-digit',
                minute: '2-digit',
              })
            }}
          </p>
          <p v-if="main.duration === null" class="activity-timing">
            Duração desconhecida; confira antes de começar.
          </p>
          <details v-if="!compact" class="recommendation-explanation">
            <summary>Por que esta sugestão?</summary>
            <p>{{ main.reason }}</p>
          </details>
          <label
            v-if="main.type === 'habit' && main.habit.goal?.kind === 'quantity'"
            class="session-amount"
            >Quantidade nesta sessão ({{ main.habit.goal.unit }})<input
              v-model.number="amount"
              type="number"
              min="0.001"
              step="any"
              max="1000000000"
          /></label>
          <div class="suggestion-actions">
            <button v-if="main.type === 'habit'" class="text-button" @click="begin(main)">
              Começar hábito
            </button>
            <button
              v-if="main.type === 'iema' || main.type === 'platform'"
              class="text-button"
              @click="begin(main)"
            >
              Começar sessão de foco
            </button>
            <button
              class="primary"
              :disabled="main.type === 'habit' && (!Number.isFinite(amount) || amount <= 0)"
              @click="act(main)"
            >
              <component
                :is="main.type === 'task' && main.task.status !== 'active' ? Play : Check"
                :size="14"
              />{{
                main.type === 'task'
                  ? main.task.status === 'active'
                    ? 'Finalizar tarefa'
                    : 'Começar agora'
                  : main.type === 'iema'
                    ? 'Abrir no IEMA'
                    : main.type === 'platform'
                      ? 'Escolher próxima ação'
                      : main.type === 'routine'
                        ? 'Já fiz'
                        : main.habit.goal?.kind === 'quantity'
                          ? 'Registrar sessão'
                          : 'Concluir hábito'
              }}
            </button>
            <button
              v-if="
                !compact &&
                !planning.running &&
                (main.type === 'iema' ||
                  (main.type === 'task' &&
                    (main.task.integrationName ||
                      planning.data.preferences.workCategoryIds.includes(main.task.categoryId))))
              "
              class="text-button"
              @click="begin(main)"
            >
              Iniciar sessão de trabalho
            </button>
            <span
              v-if="!compact && main.type === 'task' && main.task.status === 'active'"
              class="task-active-badge"
              role="status"
              ><span aria-hidden="true" />Em andamento</span
            >
            <button
              class="text-button postpone-action"
              title="Pular esta sugestão e ver a próxima"
              @click="skip(main)"
            >
              Agora não
            </button>
            <details
              v-if="
                compact &&
                !planning.running &&
                main.type === 'task' &&
                (main.task.integrationName ||
                  planning.data.preferences.workCategoryIds.includes(main.task.categoryId))
              "
              class="compact-more"
            >
              <summary>Mais opções</summary>
              <button
                v-if="
                  !planning.running &&
                  main.type === 'task' &&
                  (main.task.integrationName ||
                    planning.data.preferences.workCategoryIds.includes(main.task.categoryId))
                "
                class="text-button"
                @click="begin(main)"
              >
                Iniciar sessão de trabalho
              </button>
            </details>
          </div>
        </div>
        <div v-else class="suggested-task empty-recommend" aria-live="polite">
          <span class="empty-recommend-icon"
            ><Coffee
              v-if="compact && (paused || hasPendingTasks)"
              :size="23"
              :stroke-width="1.6"
              aria-hidden="true" /><Sparkles
              v-else
              :size="23"
              :stroke-width="1.6"
              aria-hidden="true"
          /></span>
          <h3>{{ compact ? compactEmptyTitle : result.rest.title }}</h3>
          <p>{{ compact ? compactEmptyMessage : result.rest.reason }}</p>
        </div>
      </div>
      <button
        v-if="round.skipped.length || deferred.some((d) => d.until > now.getTime())"
        class="text-button"
        @click="
          deferred = [];
          updateRound(newRound(dateKey(now), round.number));
        "
      >
        Rever sugestões puladas
      </button>
      <div
        v-if="otherActivities.length && !execution.current && !planning.running"
        class="alternatives"
      >
        <h3>Outras possibilidades</h3>
        <p>Escolha outra atividade se fizer sentido para você.</p>
        <button
          v-for="activity in otherActivities"
          :key="activity.key"
          :disabled="!!main && !!criticalToken(main, context)"
          @click="choose(activity)"
        >
          <strong>{{ activity.title }}</strong
          ><span class="alternative-meta"
            ><ActivityBadge
              :source="
                activity.type === 'task' && activity.task.integrationName
                  ? 'platform'
                  : activity.type
              "
            />{{ activity.duration === null ? 'Sem estimativa' : activity.duration + ' min' }}</span
          >
        </button>
      </div>
      <div v-if="selectedPlatform">
        <button class="text-button" @click="selectedPlatformKey = ''">
          Fechar detalhes da plataforma
        </button>
        <PlatformCard :platform="selectedPlatform" />
      </div>
    </template>
  </section>
</template>
<style scoped>
.recommendation-compact {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 15px;
  padding: 22px;
  margin-bottom: 28px;
  box-shadow: var(--friendly-shadow);
}
.recommendation-compact::after {
  display: none;
}
.recommendation-compact .recommend-layout {
  display: block;
}
.recommendation-compact .recommend-intro {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 18px;
}
.next-action-heading {
  min-width: 0;
}
.next-action-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--accent-ink);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 1px;
  margin-bottom: 7px;
}
.recommendation-compact .recommend-intro h2 {
  font-size: 18px;
  color: var(--text);
  letter-spacing: -0.35px;
}
.compact-time {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--muted);
}
.compact-time span {
  display: flex;
  align-items: center;
  gap: 5px;
}
.compact-time input {
  width: 62px;
  padding: 8px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: var(--input);
  color: var(--text);
}
.recommendation-compact .suggested-task {
  min-height: 0;
  padding: 20px;
  background: var(--card-wash);
  border: 1px solid var(--line);
  border-radius: 12px;
}
.recommendation-compact .suggested-task h3 {
  font-size: 22px;
  font-weight: 600;
  line-height: 1.35;
  letter-spacing: -0.45px;
  color: var(--text);
  margin: 16px 0 9px;
  overflow-wrap: anywhere;
}
.suggested-tag {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}
.suggested-tag .duration {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--muted);
  margin: 0;
  letter-spacing: 0;
}
.recommendation-compact .suggested-task .suggestion-reason {
  color: var(--muted);
  font-size: 13px;
  line-height: 1.7;
  margin: 0 0 18px;
}
.recommendation-compact .suggestion-actions {
  gap: 10px 16px;
}
.recommendation-compact .suggestion-actions .primary {
  font-size: 12px;
  min-height: 40px;
  padding: 9px 14px;
  border-radius: 9px;
}
.recommendation-compact .suggestion-actions .text-button {
  font-size: 12px;
  color: var(--accent-ink);
}
.recommendation-compact .suggestion-actions .postpone-action {
  color: var(--muted);
}
.compact-more {
  width: 100%;
  font-size: 11px;
  color: var(--muted);
}
.compact-more summary {
  cursor: pointer;
}
.compact-more[open] {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.empty-recommend-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  color: var(--accent-ink);
  border-radius: 11px;
  background: var(--soft);
  margin-bottom: 10px;
}
.recommendation-compact .empty-recommend h3 {
  font-size: 19px;
  margin: 0 0 8px;
}
.recommendation-compact .empty-recommend p {
  font-size: 13px;
  line-height: 1.6;
  color: var(--muted);
  margin: 0;
}
.recommendation-explanation {
  font-size: 12px;
  margin: 12px 0;
  color: var(--muted);
}
.recommendation-explanation summary {
  cursor: pointer;
}
.recommendation-settings {
  background: transparent;
  border: 0;
  padding: 0;
}
.alternatives button strong {
  display: block;
  font-size: 13px;
  font-weight: 500;
}
.alternatives .alternative-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}
.alternatives .alternative-meta :deep(.activity-badge) {
  display: inline-flex;
  margin: 0;
  font-size: 11px;
  color: var(--accent-ink);
}
@media (max-width: 640px) {
  .recommendation-compact {
    padding: 16px;
  }
  .recommendation-compact .suggested-task {
    padding: 16px;
  }
  .recommendation-compact .suggested-task h3 {
    font-size: 21px;
  }
  .recommendation-compact .suggested-task .suggestion-reason {
    font-size: 12px;
  }
  .compact-time {
    width: 100%;
    justify-content: space-between;
  }
}

.activity-filter,
.session-amount {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 14px;
  font-size: 12px;
}
.activity-filter select,
.session-amount input {
  padding: 8px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--input);
  color: inherit;
  max-width: 250px;
}
.suggestion-actions {
  flex-wrap: wrap;
}
.planning-options {
  margin: 16px 0;
  font-size: 12px;
}
.planning-options summary {
  cursor: pointer;
}
.planning-options label {
  display: grid;
  gap: 6px;
  margin: 12px 0;
}
.planning-options input,
.planning-options select {
  min-width: 0;
  max-width: 100%;
  padding: 8px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--input);
  color: inherit;
}
.planning-options fieldset {
  border: 1px solid var(--line);
  padding: 12px;
  border-radius: 8px;
  margin: 12px 0;
}
.planning-options .planning-check {
  display: flex;
  align-items: center;
}
</style>
