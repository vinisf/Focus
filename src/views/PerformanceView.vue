<script setup lang="ts">
import { computed, ref } from 'vue';
import { Layers, Leaf, Clock, Timer, ListTodo } from 'lucide-vue-next';
import { useTasks } from '../stores/tasks';
import { useHabits } from '../stores/habits';
import { usePlanning } from '../stores/planning';
import { usePerformanceHistory } from '../stores/performanceHistory';
import { addDays, dateKey } from '../utils/dates';
import { planOn } from '../utils/habits';
import {
  evolutionRanges,
  completedInPeriod,
  formatDuration,
  performanceRange,
  periodConsistency,
  periodProductivity,
  sessionMinutes,
  type PerformancePeriod,
} from '../utils/performance';

const props = defineProps<{ now: Date }>();
const tasks = useTasks(),
  habits = useHabits(),
  planning = usePlanning(),
  history = usePerformanceHistory();
const period = ref<PerformancePeriod>('today');
const evolution = ref<'days' | 'weeks' | 'months'>('days');
const today = computed(() => dateKey(props.now));
const range = computed(() => performanceRange(period.value, today.value));
const productivity = computed(() =>
  periodProductivity(tasks.data.tasks, history.snapshots, range.value),
);
const consistency = computed(() =>
  periodConsistency(habits.data, range.value, today.value, period.value === 'today'),
);
const completed = computed(() =>
  completedInPeriod(tasks.data.tasks, history.snapshots, range.value),
);
const estimated = computed(() => completed.value.reduce((sum, t) => sum + t.duration, 0));
const pending = computed(
  () => tasks.data.tasks.filter((t) => ['pending', 'active'].includes(t.status)).length,
);
const worked = computed(() => sessionMinutes(planning.data.sessions, range.value, props.now));
const hasSessions = computed(() =>
  planning.data.sessions.some(
    (s) =>
      s.endedAt &&
      Date.parse(s.startedAt) <
        Math.min(
          new Date(addDays(range.value.end, 1) + 'T00:00:00').getTime(),
          props.now.getTime(),
        ) &&
      Date.parse(s.endedAt) > new Date(range.value.start + 'T00:00:00').getTime(),
  ),
);
const flexible = computed(() =>
  habits.data.habits.some((h) => {
    const plan = planOn(h, today.value);
    return plan?.active && plan.frequency.kind === 'weekly';
  }),
);
const points = computed(() =>
  evolutionRanges(evolution.value, today.value).map((r) => ({
    ...r,
    productivity: periodProductivity(tasks.data.tasks, history.snapshots, r),
    consistency: periodConsistency(habits.data, r, r.end, evolution.value === 'days'),
  })),
);
const hasPoints = computed(() =>
  points.value.some((p) => p.productivity.percent !== null || p.consistency.percent !== null),
);
const series = ['productivity', 'consistency'] as const;
function x(index: number) {
  return 42 + index * (616 / Math.max(1, points.value.length - 1));
}
function y(percent: number) {
  return 180 - percent * 1.5;
}
function path(key: (typeof series)[number]) {
  let connected = false;
  return points.value
    .map((point, i) => {
      const value = point[key].percent;
      if (value === null) {
        connected = false;
        return '';
      }
      const command = connected ? 'L' : 'M';
      connected = true;
      return `${command}${x(i)},${y(value)}`;
    })
    .join(' ');
}
const indicators = computed(() => [
  {
    key: 'productivity',
    label: 'Produtividade',
    icon: Layers,
    metric: productivity.value,
    unit: 'tarefas concluídas',
    empty:
      period.value === 'today' ? 'Sem tarefas planejadas hoje' : 'Sem tarefas previstas no período',
  },
  {
    key: 'consistency',
    label: 'Consistência',
    icon: Leaf,
    metric: consistency.value,
    unit: 'realizações cumpridas',
    empty:
      period.value === 'today' ? 'Nenhum hábito previsto hoje' : 'Sem hábitos previstos no período',
  },
]);
</script>

<template>
  <div class="performance-dashboard">
    <div class="performance-toolbar">
      <div role="group" aria-label="Período do desempenho" class="performance-switch">
        <button
          v-for="option in [
            ['today', 'Hoje'],
            ['week', 'Semana'],
            ['month', 'Mês'],
          ] as const"
          :key="option[0]"
          :aria-pressed="period === option[0]"
          @click="period = option[0]"
        >
          {{ option[1] }}
        </button>
      </div>
      <span
        >{{ new Date(range.start + 'T12:00:00').toLocaleDateString('pt-BR')
        }}<template v-if="range.start !== range.end">
          – {{ new Date(range.end + 'T12:00:00').toLocaleDateString('pt-BR') }}</template
        ></span
      >
    </div>

    <div class="performance-main" aria-live="polite">
      <article
        v-for="indicator in indicators"
        :key="indicator.key"
        class="performance-card"
        :class="indicator.key + '-summary'"
      >
        <h2>
          <component :is="indicator.icon" :size="18" aria-hidden="true" />{{ indicator.label }}
        </h2>
        <strong class="performance-value">{{
          indicator.metric.percent === null ? '—' : indicator.metric.percent + '%'
        }}</strong>
        <p v-if="indicator.metric.expected">
          {{ indicator.metric.done }} de {{ indicator.metric.expected }} {{ indicator.unit }}
        </p>
        <p v-else>{{ indicator.empty }}</p>
        <small
          v-if="indicator.key === 'consistency' && flexible && period === 'today'"
          class="performance-note"
          >Metas flexíveis: progresso da semana.</small
        >
        <div
          v-if="indicator.metric.percent !== null"
          class="performance-bar"
          role="progressbar"
          :aria-label="indicator.label"
          :aria-valuenow="indicator.metric.percent"
          :aria-valuemin="0"
          :aria-valuemax="100"
        >
          <i :style="{ width: indicator.metric.percent + '%' }" />
        </div>
        <span v-else class="performance-no-data">Seus avanços aparecem por aqui.</span>
      </article>
    </div>

    <div class="performance-secondary" aria-live="polite">
      <article class="performance-card">
        <h3><ListTodo :size="16" aria-hidden="true" />Tarefas pendentes</h3>
        <strong>{{ pending }}</strong
        ><small>Total em aberto agora</small>
      </article>
      <article class="performance-card">
        <h3><Clock :size="16" aria-hidden="true" />Tempo estimado concluído</h3>
        <strong>{{ completed.length ? formatDuration(estimated) : '—' }}</strong
        ><small>Estimativas das conclusões no período</small>
      </article>
      <article class="performance-card">
        <h3><Timer :size="16" aria-hidden="true" />Tempo registrado</h3>
        <strong>{{ hasSessions ? formatDuration(worked) : '—' }}</strong
        ><small>{{
          hasSessions ? 'Sessões encerradas no período' : 'Sem sessões encerradas no período'
        }}</small>
      </article>
    </div>
    <p v-if="planning.running" class="performance-note">
      Há uma sessão aberta. O tempo será confirmado quando ela for encerrada.
    </p>

    <section
      class="performance-card performance-evolution"
      aria-labelledby="performance-evolution-title"
    >
      <div class="performance-chart-heading">
        <div>
          <h2 id="performance-evolution-title">Seus avanços ao longo do tempo</h2>
          <p>Cada dimensão tem seu próprio ritmo.</p>
        </div>
        <select v-model="evolution" aria-label="Escala da evolução">
          <option value="days">Últimos 7 dias</option>
          <option value="weeks">Semanas do mês</option>
          <option value="months">Evolução mensal</option>
        </select>
      </div>
      <div class="performance-legend">
        <span class="productivity">Produtividade</span><span class="consistency">Consistência</span>
      </div>
      <svg
        v-if="hasPoints"
        class="performance-chart"
        viewBox="0 0 700 222"
        role="img"
        aria-labelledby="performance-chart-title performance-chart-description"
      >
        <title id="performance-chart-title">Evolução da produtividade e da consistência</title>
        <desc id="performance-chart-description">
          Percentuais de 0 a 100. Períodos sem atividades previstas ficam sem pontos. Consulte os
          valores na tabela abaixo.
        </desc>
        <g v-for="level in [0, 50, 100]" :key="level" class="performance-grid">
          <line x1="42" x2="658" :y1="y(level)" :y2="y(level)" />
          <text x="2" :y="y(level) + 4">{{ level }}%</text>
        </g>
        <g v-for="key in series" :key="key" :class="key">
          <path :d="path(key)" />
          <template v-for="(point, index) in points" :key="point.start">
            <circle
              v-if="point[key].percent !== null"
              :cx="x(index)"
              :cy="y(point[key].percent!)"
              :r="key === 'productivity' ? 4 : 2.5"
            >
              <title>
                {{ point.label }}: {{ key === 'productivity' ? 'Produtividade' : 'Consistência' }}
                {{ point[key].percent }}%
              </title>
            </circle>
          </template>
        </g>
        <text
          v-for="(point, index) in points"
          :key="point.start"
          :x="x(index)"
          y="207"
          text-anchor="middle"
          class="performance-axis"
        >
          {{ point.label }}
        </text>
      </svg>
      <p v-else class="performance-empty">Ainda não há atividades previstas neste intervalo.</p>
      <details class="performance-values">
        <summary>Ver valores por período</summary>
        <div class="performance-table-scroll">
          <table>
            <caption>
              Resultados do intervalo selecionado
            </caption>
            <thead>
              <tr>
                <th>Período</th>
                <th>Produtividade</th>
                <th>Consistência</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="point in points" :key="point.start">
                <th scope="row">{{ point.label }}</th>
                <td v-for="key in series" :key="key">
                  {{
                    point[key].percent === null
                      ? 'Sem dados'
                      : `${point[key].percent}% (${point[key].done}/${point[key].expected})`
                  }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </details>
    </section>
    <details class="performance-method">
      <summary>Como os resultados são calculados</summary>
      <p>
        Produtividade considera cada tarefa uma vez no período, pelo dia planejado ou, na ausência
        dele, pelo vencimento. Conclusões fora do período não entram no percentual. O tempo estimado
        inclui todas as tarefas concluídas no período, mesmo sem planejamento.
      </p>
      <p>
        Consistência respeita os dias e as versões da frequência de cada hábito. Metas semanais
        flexíveis são acompanhadas na semana, sem exigir dias fixos. Períodos sem previsão ficam sem
        percentual.
      </p>
      <p>
        O histórico de replanejamentos é registrado a partir desta versão. Para datas anteriores ao
        primeiro registro, usamos o planejamento disponível naquela primeira leitura; não é possível
        reconstruir alterações antigas.
      </p>
      <p>
        Somente sessões encerradas entram no tempo confirmado. Sessões que atravessam dias são
        divididas pelo horário local; intervalos sobrepostos contam uma vez. O registro atual não
        distingue pausas: se a sessão ficou aberta durante uma pausa, esse intervalo faz parte da
        duração registrada. Nenhum histórico é corrigido automaticamente.
      </p>
    </details>
    <p v-if="history.error" role="alert">{{ history.error }}</p>
    <details v-if="planning.running || planning.error" class="performance-method">
      <summary>Sessão em andamento</summary>
      <template v-if="planning.running">
        <p>
          Tempo decorrido:
          {{ formatDuration((now.getTime() - Date.parse(planning.running.startedAt)) / 60000) }}.
          Encerre ao parar de trabalhar; o cronômetro continua após fechar o Focus.
        </p>
        <button class="performance-session-stop" @click="planning.stop()">
          Encerrar sessão e confirmar duração
        </button>
      </template>
      <p v-if="planning.error" role="alert">{{ planning.error }}</p>
    </details>
  </div>
</template>

<style scoped>
.performance-dashboard {
  --accent: #7963c9;
  --accent-ink: #6550aa;
  --soft: #f1edfb;
  --focus-ring: #917bd9;
  --performance-support: #527764;
  display: grid;
  gap: 20px;
}
:global(.dark .performance-dashboard) {
  --accent: #b7a5ee;
  --accent-ink: #d1c5f2;
  --soft: #302a40;
  --focus-ring: #b7a5ee;
  --performance-support: #a8d4b9;
}
.performance-toolbar,
.performance-chart-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.performance-toolbar > span,
.performance-chart-heading p {
  color: var(--muted);
  font-size: 12px;
}
.performance-switch {
  display: flex;
  background: var(--soft);
  padding: 4px;
  border-radius: 10px;
}
.performance-switch button {
  padding: 10px 20px;
  border-radius: 7px;
  font-size: 13px;
  color: var(--muted);
}
.performance-switch button[aria-pressed='true'] {
  background: var(--panel);
  color: var(--accent-ink);
  box-shadow: 0 1px 4px #0000000a;
}
.performance-main,
.performance-secondary {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.performance-secondary {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.performance-card {
  min-width: 0;
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 22px;
  background: var(--panel);
}
.performance-card h2,
.performance-card h3 {
  display: flex;
  align-items: center;
  gap: 9px;
  font-weight: 600;
  font-size: 14px;
  margin: 0 0 14px;
}
.performance-card h2 svg,
.performance-card h3 svg {
  color: var(--accent-ink);
  flex-shrink: 0;
}
.performance-value {
  display: block;
  font-size: 38px;
  font-weight: 600;
  color: var(--accent-ink);
}
.consistency-summary .performance-value,
.consistency-summary h2 svg {
  color: var(--performance-support);
}
.performance-card p,
.performance-no-data,
.performance-note {
  font-size: 12px;
  color: var(--muted);
  line-height: 1.6;
}
.performance-bar {
  height: 6px;
  background: var(--soft);
  border-radius: 8px;
  overflow: hidden;
  margin-top: 18px;
}
.performance-bar i {
  display: block;
  height: 100%;
  background: var(--accent);
  border-radius: inherit;
}
.consistency-summary .performance-bar i {
  background: var(--performance-support);
}
.performance-secondary strong {
  display: block;
  font-size: 24px;
  font-weight: 600;
  margin: 12px 0 7px;
}
.performance-secondary small {
  color: var(--muted);
  font-size: 11px;
}
.performance-note {
  margin: -8px 0 0;
}
.performance-chart-heading select {
  max-width: 100%;
  padding: 10px;
  background: var(--input);
  border: 1px solid var(--line);
  border-radius: 8px;
  font-size: 12px;
}
.performance-chart-heading h2 {
  margin-bottom: 5px;
}
.performance-chart-heading p {
  margin: 0;
}
.performance-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  margin: 22px 0 10px;
  font-size: 12px;
}
.performance-legend span::before {
  content: '';
  display: inline-block;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: currentColor;
  margin-right: 7px;
}
.productivity {
  color: var(--accent);
}
.consistency {
  color: var(--performance-support);
}
.performance-chart {
  display: block;
  width: 100%;
  height: auto;
  overflow: visible;
}
.performance-chart path {
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
}
.performance-chart .consistency path {
  stroke-dasharray: 5 4;
}
.performance-chart circle {
  fill: currentColor;
}
.performance-grid line {
  stroke: var(--line);
  stroke-dasharray: 3 4;
}
.performance-grid text,
.performance-axis {
  fill: var(--muted);
  font-size: 11px;
}
.performance-empty {
  padding: 36px 0;
  text-align: center;
}
.performance-values,
.performance-method {
  font-size: 12px;
  color: var(--muted);
  line-height: 1.7;
}
.performance-values summary,
.performance-method summary {
  cursor: pointer;
  padding: 8px 0;
  color: var(--text);
}
.performance-session-stop {
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  color: var(--accent-ink);
}
.performance-table-scroll {
  overflow-x: auto;
}
table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  font-size: 12px;
}
th,
td {
  padding: 10px 6px;
  border-bottom: 1px solid var(--line);
}
caption {
  text-align: left;
  padding: 10px 0;
}
@media (max-width: 640px) {
  .performance-dashboard {
    gap: 16px;
  }
  .performance-main,
  .performance-secondary {
    gap: 10px;
  }
  .performance-card {
    padding: 16px 12px;
  }
  .performance-main h2 {
    font-size: 13px;
    gap: 6px;
  }
  .performance-value {
    font-size: 32px;
  }
  .performance-secondary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .performance-secondary article:last-child {
    grid-column: 1 / -1;
  }
  .performance-chart-heading {
    align-items: flex-start;
  }
  .performance-chart-heading h2 {
    font-size: 14px;
  }
  .performance-switch {
    width: 100%;
  }
  .performance-switch button {
    flex: 1;
  }
}
@media (max-width: 350px) {
  .performance-main {
    grid-template-columns: 1fr;
  }
}
</style>
