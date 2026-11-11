<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import {
  Sun,
  CalendarDays,
  CalendarOff,
  CircleCheck,
  Shapes,
  Plus,
  Search,
  ChevronRight,
  ArrowUpRight,
  Moon,
  Menu,
  X,
  Check,
  Coffee,
  Download,
  Target,
  Leaf,
  Settings,
  ChartNoAxesCombined,
  Sunrise,
  MoonStar,
  Headset,
  ListTodo,
} from 'lucide-vue-next';
import { useTasks } from '../stores/tasks';
import { useHabits } from '../stores/habits';
import { useClock } from '../composables/useClock';
import { dateKey } from '../utils/dates';
import { rank } from '../utils/priority';
import type { Task } from '../types';
import type { Habit } from '../types/habits';

import TaskRow from '../components/TaskRow.vue';
import TaskEditor from '../components/TaskEditor.vue';
import HabitEditor from '../components/HabitEditor.vue';

import GoalsView from './GoalsView.vue';
import DailyTimeline from '../components/DailyTimeline.vue';
import WeekView from './WeekView.vue';
import BackupSettings from '../components/BackupSettings.vue';
import PerformanceView from './PerformanceView.vue';
import { usePerformanceHistory } from '../stores/performanceHistory';
import ActivitySuggestions from '../components/ActivitySuggestions.vue';
import HabitsView from './HabitsView.vue';
import IemaPanel from '../components/IemaPanel.vue';
import PlatformsPanel from '../components/PlatformsPanel.vue';
import { integrationTasksForDay } from '../utils/integrationTasks';

import { dayGreeting } from '../utils/uiCopy';
import PlanTomorrow from './PlanTomorrow.vue';
import RoutineToday from './RoutineToday.vue';
import AssistantSettings from '../components/AssistantSettings.vue';
import RoutineSettings from '../components/RoutineSettings.vue';
import { useRoutine } from '../stores/routine';
import { reviewRequested } from '../services/reviewNotifications';
const routine = useRoutine();
const store = useTasks();
const habits = useHabits();
const performanceHistory = usePerformanceHistory();
const habitEditor = ref(false);
const editingHabit = ref<Habit | null>(null);
const selectedHabitId = ref('');
const now = useClock();
const today = computed(() => dateKey(now.value));
const greeting = computed(() => dayGreeting(now.value));
const view = ref('Meu Dia');
const routineDate = ref(today.value);
const routineReturnView = ref('Meu Dia');
const routinePage = 'Minha rotina hoje está diferente';
function openRoutine(date = today.value) {
  routineDate.value = date;
  routineReturnView.value = view.value;
  navigate(routinePage);
}
watch(
  reviewRequested,
  (requested) => {
    if (requested) {
      view.value = 'Planejar amanhã';
      reviewRequested.value = false;
    }
  },
  { immediate: true },
);
type TaskTab = 'all' | 'upcoming' | 'undated' | 'done';
const taskTab = ref<TaskTab>('all');
const taskTabs = [
  {
    id: 'all',
    label: 'Todas',
    icon: ListTodo,
    emptyTitle: 'Um pequeno passo já é um começo.',
    emptyMessage: 'Adicione sua primeira tarefa quando fizer sentido para você.',
  },
  {
    id: 'upcoming',
    label: 'Próximas',
    icon: CalendarDays,
    emptyTitle: 'Nada agendado por aqui.',
    emptyMessage: 'Tarefas em aberto com planejamento ou vencimento futuro aparecem aqui.',
  },
  {
    id: 'undated',
    label: 'Sem data',
    icon: CalendarOff,
    emptyTitle: 'Nenhuma tarefa em aberto sem vencimento.',
    emptyMessage: 'Uma tarefa pode ter um dia planejado e continuar sem prazo de entrega.',
  },
  {
    id: 'done',
    label: 'Concluídas',
    icon: CircleCheck,
    emptyTitle: 'As próximas conquistas aparecem aqui.',
    emptyMessage: 'Cada tarefa concluída ganha um lugar nesta lista.',
  },
] as const;
const currentTaskTab = computed(() => taskTabs.find((tab) => tab.id === taskTab.value)!);
const showStatusFilter = computed(() => view.value === 'Tarefas' && taskTab.value === 'all');
const search = ref('');
const filter = ref('');
const statusFilter = ref('');
const sort = ref('smart');
const minutes = ref(30);
const editor = ref(false);
const editing = ref<Task | null>(null);
const mobile = ref(false);
const toast = ref('');
let toastTimer: ReturnType<typeof setTimeout>;
const dark = ref(false);
try {
  dark.value = localStorage.getItem('focus.theme') === 'dark';
} catch {
  /* Browser storage may be unavailable. */
}
watch(
  dark,
  (v) => {
    document.documentElement.classList.toggle('dark', v);
    try {
      localStorage.setItem('focus.theme', v ? 'dark' : 'light');
    } catch {
      /* Theme remains usable in memory. */
    }
  },
  { immediate: true },
);
const nav = [
  { name: 'Meu Dia', icon: Sun },
  { name: 'Semana', icon: CalendarDays },
  { name: 'Metas', icon: Target },
  { name: 'Tarefas', icon: ListTodo },
  { name: 'Categorias', icon: Shapes },
  { name: 'Hábitos', icon: Leaf },
  { name: 'Chamados IEMA', icon: Headset },
  { name: 'Desempenho', icon: ChartNoAxesCombined },
  { name: 'Configurações', icon: Settings },
];
const pending = computed(() =>
  store.data.tasks.filter((t) => t.status === 'pending' || t.status === 'active'),
);
const daily = computed(() =>
  pending.value
    .filter(
      (t) => !t.integrationName && (t.plannedDate === today.value || t.dueDate === today.value),
    )
    .concat(integrationTasksForDay(store.data.tasks, now.value, store.data.integrationDailyLimit)),
);
const visible = computed(() => {
  let tasks = view.value === 'Meu Dia' ? daily.value : store.data.tasks;
  if (view.value === 'Tarefas') {
    if (taskTab.value === 'done') tasks = tasks.filter((t) => t.status === 'done');
    if (taskTab.value === 'upcoming')
      tasks = tasks.filter(
        (t) =>
          ['pending', 'active'].includes(t.status) &&
          (t.plannedDate > today.value || t.dueDate > today.value),
      );
    if (taskTab.value === 'undated')
      tasks = tasks.filter((t) => ['pending', 'active'].includes(t.status) && !t.dueDate);
  }
  tasks = tasks.filter(
    (t) =>
      (!filter.value || t.categoryId === filter.value) &&
      (!showStatusFilter.value || !statusFilter.value || t.status === statusFilter.value) &&
      (t.title + ' ' + t.description)
        .toLocaleLowerCase()
        .includes(search.value.toLocaleLowerCase()),
  );
  return [...tasks].sort((a, b) =>
    sort.value === 'title'
      ? a.title.localeCompare(b.title)
      : sort.value === 'due'
        ? (a.dueDate || '9999').localeCompare(b.dueDate || '9999')
        : rank(b, minutes.value, now.value).score - rank(a, minutes.value, now.value).score,
  );
});
function notify(message: string) {
  toast.value = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.value = ''), 3200);
}
function edit(task: Task | null = null) {
  editing.value = task ? (JSON.parse(JSON.stringify(task)) as Task) : null;
  editor.value = true;
}
function editHabit(habit: Habit | null = null) {
  editingHabit.value = habit ? (JSON.parse(JSON.stringify(habit)) as Habit) : null;
  habitEditor.value = true;
}
function navigate(name: string) {
  // This app has no URL router. Keep previous internal view names compatible.
  const legacyTaskViews: Record<string, TaskTab> = {
    'Todas as Tarefas': 'all',
    Próximas: 'upcoming',
    'Sem Data': 'undated',
    'Sem data': 'undated',
    Concluídas: 'done',
  };
  const tab = Object.hasOwn(legacyTaskViews, name) ? legacyTaskViews[name] : undefined;
  view.value = tab ? 'Tarefas' : name;
  if (tab) taskTab.value = tab;
  filter.value = '';
  statusFilter.value = '';
  search.value = '';
  mobile.value = false;
}
function selectTaskTab(tab: TaskTab) {
  taskTab.value = tab;
}
function onTaskTabKey(event: KeyboardEvent, index: number) {
  let target = index;
  if (event.key === 'ArrowRight') target = (index + 1) % taskTabs.length;
  else if (event.key === 'ArrowLeft') target = (index + taskTabs.length - 1) % taskTabs.length;
  else if (event.key === 'Home') target = 0;
  else if (event.key === 'End') target = taskTabs.length - 1;
  else return;
  event.preventDefault();
  const tab = taskTabs[target]!;
  selectTaskTab(tab.id);
  void nextTick(() => document.getElementById(`task-tab-${tab.id}`)?.focus());
}
const categoryName = ref('');
const categoryColor = ref('#356fb0');
const categoryEditing = ref('');
function saveCategory() {
  const name = categoryName.value.trim();
  if (!name) return;
  const c = store.data.categories.find((c) => c.id === categoryEditing.value);
  if (c) {
    c.name = name;
    c.color = categoryColor.value;
  } else store.data.categories.push({ id: crypto.randomUUID(), name, color: categoryColor.value });
  categoryName.value = '';
  categoryEditing.value = '';
  notify('Categoria salva');
}
function exportData() {
  const raw = JSON.stringify(
    {
      version: 2,
      routine: routine.blocked ? localStorage.getItem('focus.routine.v1') : routine.data,
      tasks: store.blocked ? localStorage.getItem('focus.v1') : store.data,
      habits: habits.blocked ? localStorage.getItem('focus.habits.v1') : habits.data,
      performanceHistory: performanceHistory.blocked
        ? localStorage.getItem('focus.performance.v1')
        : { version: 1, snapshots: performanceHistory.snapshots },
    },
    null,
    2,
  );
  const url = URL.createObjectURL(new Blob([raw ?? ''], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'focus-backup.json';
  a.click();
  URL.revokeObjectURL(url);
}
</script>
<template>
  <div class="app-shell" :class="{ 'home-view': view === 'Meu Dia' }">
    <aside class="sidebar" :class="{ open: mobile }">
      <a class="brand" href="#" @click.prevent="navigate('Meu Dia')"
        ><span class="brand-mark"><Target :size="25" /></span>focus<span class="brand-dot"
          >.</span
        ></a
      >
      <span class="workspace-label">UM ESPAÇO PARA O SEU DIA</span>
      <nav aria-label="Navegação principal">
        <button
          v-for="item in nav"
          :key="item.name"
          :class="{ selected: view === item.name }"
          :aria-current="view === item.name ? 'page' : undefined"
          @click="navigate(item.name)"
        >
          <span class="nav-icon"
            ><component :is="item.icon" :size="18" :stroke-width="1.7" aria-hidden="true" /></span
          >{{ item.name
          }}<span v-if="item.name === 'Meu Dia'" class="nav-count">{{ daily.length }}</span
          ><span v-if="item.name === 'Tarefas'" class="subtle-count">{{ pending.length }}</span>
        </button>
      </nav>
      <div v-if="view !== 'Meu Dia'" class="sidebar-categories">
        <div class="side-heading">
          CATEGORIAS<button aria-label="Gerenciar categorias" @click="navigate('Categorias')">
            <Plus :size="15" />
          </button>
        </div>
        <button
          v-for="c in store.data.categories"
          :key="c.id"
          :class="{ selected: filter === c.id }"
          @click="
            navigate('Todas as Tarefas');
            filter = c.id;
          "
        >
          <i :style="{ background: c.color }" />{{ c.name
          }}<span>{{ pending.filter((t) => t.categoryId === c.id).length }}</span>
        </button>
      </div>
      <div class="sidebar-bottom">
        <div class="gentle-note" :class="{ 'gentle-note-quiet': view === 'Meu Dia' }">
          <Coffee :size="20" /><strong>Um passo de cada vez.</strong>
          <p v-if="view !== 'Meu Dia'">Você não precisa fazer tudo hoje.</p>
        </div>
        <button class="theme-toggle" @click="dark = !dark">
          <component :is="dark ? Sun : Moon" :size="17" />{{ dark ? 'Modo claro' : 'Modo escuro'
          }}<span class="toggle" :class="{ on: dark }" /></button
        ><button class="profile" @click="exportData">
          <span class="avatar">EU</span
          ><span><strong>Meu espaço</strong><small>Salvo neste navegador</small></span
          ><Download :size="16" />
        </button>
      </div>
    </aside>
    <button v-if="mobile" class="mobile-shade" aria-label="Fechar menu" @click="mobile = false" />
    <div class="main-shell">
      <header class="topbar">
        <button
          class="mobile-menu icon-button"
          aria-label="Abrir menu"
          :aria-expanded="mobile"
          @click="mobile = true"
        >
          <Menu :size="22" /></button
        ><span
          >Meu espaço <ChevronRight :size="14" /> <strong>{{ view }}</strong></span
        >
        <div>
          <span v-if="view !== 'Meu Dia'" class="local-indicator" :class="{ late: !!store.error }"
            ><i />{{ store.error ? 'Verifique o armazenamento' : 'Seu ritmo, seu espaço' }}</span
          ><button
            v-if="!['Configurações', 'Desempenho', 'Semana', 'Metas', routinePage].includes(view)"
            class="top-add"
            @click="view === 'Hábitos' ? editHabit() : edit()"
          >
            <Plus :size="18" />{{ view === 'Hábitos' ? 'Novo hábito' : 'Nova tarefa' }}
          </button>
        </div>
      </header>
      <main>
        <div v-if="store.error" role="alert" class="error-banner">
          {{ store.error }} <button @click="exportData">Exportar dados</button>
        </div>
        <div v-if="habits.error" role="alert" class="error-banner">
          {{ habits.error }} <button @click="exportData">Exportar dados</button>
        </div>
        <div class="page-heading">
          <div>
            <p class="eyebrow">
              {{
                now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
              }}
            </p>
            <h1 v-if="view === 'Meu Dia'" class="greeting-title">
              <span class="greeting-icon"
                ><component
                  :is="
                    greeting.period === 'morning'
                      ? Sunrise
                      : greeting.period === 'afternoon'
                        ? Sun
                        : MoonStar
                  "
                  :size="23"
                  :stroke-width="1.6"
                  aria-hidden="true"
              /></span>
              <span>{{ greeting.title }}</span>
            </h1>
            <h1 v-else>{{ view === 'Desempenho' ? 'Seu desempenho' : view }}</h1>
            <p v-if="view === 'Desempenho'">Acompanhe seus avanços no seu ritmo</p>
            <p v-else-if="view === 'Configurações'">Deixe o Focus do seu jeito.</p>
            <p v-else-if="view === 'Tarefas'">Uma lista para organizar seus próximos passos.</p>
          </div>
          <button
            v-if="!['Configurações', 'Desempenho', 'Semana', 'Metas', routinePage].includes(view)"
            class="primary"
            @click="view === 'Hábitos' ? editHabit() : edit()"
          >
            <Plus :size="17" />{{ view === 'Hábitos' ? 'Novo hábito' : 'Nova tarefa' }}
          </button>
        </div>
        <template v-if="view === 'Meu Dia'">
          <button class="text-button plan-tomorrow-link" @click="navigate('Planejar amanhã')">
            <CalendarDays :size="15" />Planejar amanhã
          </button>
          <button class="text-button routine-today" @click="openRoutine()">
            <CalendarDays :size="15" aria-hidden="true" />Minha rotina hoje está diferente
          </button>
          <ActivitySuggestions
            v-model:minutes="minutes"
            compact
            :now="now"
            @edit-task="edit"
            @edit-habit="editHabit"
            @changed="notify"
          />

          <button class="text-button" @click="navigate('Tarefas')">Ver minhas tarefas</button>
          <DailyTimeline :now="now" />
        </template>
        <RoutineToday
          v-if="view === routinePage"
          :date="routineDate"
          @back="navigate(routineReturnView)"
        />
        <PlanTomorrow
          v-if="view === 'Planejar amanhã'"
          :now="now"
          @changed="notify"
          @edit-task="edit"
          @adjust-routine="openRoutine"
        />
        <GoalsView v-if="view === 'Metas'" />
        <WeekView v-if="view === 'Semana'" />
        <PerformanceView v-if="view === 'Desempenho'" :now="now" />
        <section
          v-if="view === 'Configurações'"
          class="settings-sections"
          aria-label="Configurações"
        >
          <details>
            <summary>Backup completo</summary>
            <BackupSettings />
          </details>
          <details>
            <summary>Minha Rotina</summary>
            <RoutineSettings />
            <button class="text-button" @click="openRoutine()">
              Minha rotina hoje está diferente
            </button>
          </details>
          <details open>
            <summary>Integrações e planilha Excel</summary>
            <PlatformsPanel mode="list" />
          </details>
          <details>
            <summary>Conexão IEMA</summary>
            <IemaPanel mode="settings" />
          </details>
          <details>
            <summary>Preferências de sugestões</summary>
            <ActivitySuggestions v-model:minutes="minutes" :now="now" settings-only />
          </details>
          <details>
            <summary>Assistente e revisão noturna</summary>
            <AssistantSettings />
            <button class="text-button" @click="navigate('Planejar amanhã')">
              Abrir revisão de amanhã
            </button>
          </details>
        </section>
        <IemaPanel v-else-if="view === 'Chamados IEMA'" mode="tickets" />

        <HabitsView
          v-else-if="view === 'Hábitos'"
          :today="today"
          :initial-id="selectedHabitId"
          @create="editHabit()"
          @edit="editHabit"
          @changed="notify"
        />
        <section v-else-if="view === 'Categorias'" class="category-panel">
          <div class="section-heading">
            <h2>Áreas da sua vida</h2>
            <span>{{ store.data.categories.length }} categorias</span>
          </div>
          <form class="category-form" @submit.prevent="saveCategory">
            <input
              v-model="categoryName"
              required
              maxlength="60"
              placeholder="Nome da categoria"
              aria-label="Nome da categoria"
            /><input v-model="categoryColor" type="color" aria-label="Cor da categoria" /><button
              class="primary"
            >
              {{ categoryEditing ? 'Salvar' : 'Criar categoria' }}</button
            ><button
              v-if="categoryEditing"
              type="button"
              @click="
                categoryEditing = '';
                categoryName = '';
              "
            >
              Cancelar
            </button>
          </form>
          <div class="category-grid">
            <article v-for="c in store.data.categories" :key="c.id">
              <i :style="{ background: c.color }" />
              <h3>{{ c.name }}</h3>
              <p>
                {{ pending.filter((t) => t.categoryId === c.id).length }} pendentes ·
                {{
                  store.data.tasks.filter((t) => t.categoryId === c.id && t.status === 'done')
                    .length
                }}
                concluídas
              </p>
              <div class="category-actions">
                <button
                  @click="
                    navigate('Todas as Tarefas');
                    filter = c.id;
                  "
                >
                  Ver tarefas <ArrowUpRight :size="14" /></button
                ><button
                  @click="
                    categoryEditing = c.id;
                    categoryName = c.name;
                    categoryColor = c.color;
                  "
                >
                  Editar
                </button>
              </div>
            </article>
          </div>
        </section>
        <template v-else-if="view === 'Tarefas'">
          <div class="task-tabs" role="tablist" aria-label="Visualizações de tarefas">
            <button
              v-for="(tab, index) in taskTabs"
              :id="`task-tab-${tab.id}`"
              :key="tab.id"
              type="button"
              role="tab"
              :aria-selected="taskTab === tab.id"
              aria-controls="task-tab-panel"
              :tabindex="taskTab === tab.id ? 0 : -1"
              @click="selectTaskTab(tab.id)"
              @keydown="onTaskTabKey($event, index)"
            >
              <component :is="tab.icon" :size="15" :stroke-width="1.7" aria-hidden="true" />{{
                tab.label
              }}
            </button>
          </div>
          <section
            id="task-tab-panel"
            class="task-section"
            role="tabpanel"
            :aria-labelledby="`task-tab-${taskTab}`"
            tabindex="0"
          >
            <div class="section-heading">
              <h2>
                {{ currentTaskTab.label }}
                <span class="count-pill">{{ visible.length }}</span>
              </h2>
            </div>
            <p v-if="view === 'Tarefas' && taskTab === 'undated'" class="task-tab-description">
              Sem vencimento, mesmo que você já tenha escolhido um dia para fazer.
            </p>
            <p
              v-else-if="view === 'Tarefas' && taskTab === 'upcoming'"
              class="task-tab-description"
            >
              Em aberto, com planejamento ou vencimento depois de hoje.
            </p>
            <div class="list-toolbar">
              <label class="search-box"
                ><Search :size="16" /><input
                  v-model="search"
                  placeholder="Buscar uma tarefa…"
                  aria-label="Buscar tarefas" /></label
              ><select v-model="filter" aria-label="Filtrar categoria">
                <option value="">Todas as categorias</option>
                <option v-for="c in store.data.categories" :key="c.id" :value="c.id">
                  {{ c.name }}
                </option></select
              ><select v-if="showStatusFilter" v-model="statusFilter" aria-label="Filtrar status">
                <option value="">Todos os status</option>
                <option value="pending">Pendentes</option>
                <option value="active">Em andamento</option>
                <option value="done">Concluídas</option>
                <option value="cancelled">Canceladas</option></select
              ><select v-model="sort" aria-label="Ordenar tarefas">
                <option value="smart">Por relevância</option>
                <option value="due">Por vencimento</option>
                <option value="title">Por título</option>
              </select>
            </div>
            <div class="task-list">
              <TaskRow
                v-for="task in visible"
                :key="task.id"
                :task="task"
                :today="today"
                @edit="edit"
                @completed="notify('Tarefa concluída. Cada passo conta!')"
              />
              <div v-if="!visible.length" class="empty-state">
                <span class="empty-icon"
                  ><component
                    :is="view === 'Tarefas' && taskTab === 'done' ? CircleCheck : Sun"
                    :size="25"
                /></span>
                <h3>
                  {{
                    search || filter || (showStatusFilter && statusFilter)
                      ? 'Nenhuma tarefa encontrada'
                      : currentTaskTab.emptyTitle
                  }}
                </h3>
                <p>
                  {{
                    search || filter || (showStatusFilter && statusFilter)
                      ? 'Experimente ajustar sua busca ou os filtros.'
                      : currentTaskTab.emptyMessage
                  }}
                </p>
              </div>
              <button class="add-task-row" @click="edit()">
                <Plus :size="18" /> Adicionar uma tarefa <span>Um passo de cada vez</span>
              </button>
            </div>
          </section>
        </template>
        <footer v-if="view !== 'Meu Dia'" class="page-footer">
          <span class="mini-brand">focus.</span> Clareza para agir. Espaço para viver.<button
            @click="exportData"
          >
            <Download :size="13" /> Exportar meus dados
          </button>
        </footer>
      </main>
    </div>
    <TaskEditor
      v-if="editor"
      :task="editing"
      @deleted="
        editor = false;
        notify('Tarefa excluída.');
      "
      @close="editor = false"
      @saved="
        editor = false;
        notify('Tarefa salva com sucesso');
      "
    />
    <HabitEditor
      v-if="habitEditor"
      :habit="editingHabit"
      @deleted="
        habitEditor = false;
        notify('Hábito e histórico excluídos.');
      "
      @close="habitEditor = false"
      @saved="
        habitEditor = false;
        notify('Hábito salvo com sucesso');
      "
    />
    <Transition name="toast"
      ><div v-if="toast" role="status" class="toast">
        <Check :size="17" />{{ toast
        }}<button aria-label="Dispensar" @click="toast = ''"><X :size="15" /></button></div
    ></Transition>
  </div>
</template>
