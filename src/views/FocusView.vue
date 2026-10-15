<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  Sun,
  Layers,
  CalendarDays,
  CalendarOff,
  CircleCheck,
  Shapes,
  Plus,
  Search,
  ChevronRight,
  ArrowUpRight,
  Sparkles,
  Play,
  Moon,
  Menu,
  X,
  Check,
  Coffee,
  Download,
  Target,
} from 'lucide-vue-next';
import { useTasks } from '../stores/tasks';
import { useClock } from '../composables/useClock';
import { dateKey, addDays } from '../utils/dates';
import { recommend, rank } from '../utils/priority';
import type { Task } from '../types';
import TaskRow from '../components/TaskRow.vue';
import TaskEditor from '../components/TaskEditor.vue';
const store = useTasks();
const now = useClock();
const today = computed(() => dateKey(now.value));
const view = ref('Meu Dia');
const search = ref('');
const filter = ref('');
const statusFilter = ref('');
const sort = ref('smart');
const minutes = ref(30);
const alternatives = ref(false);
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
  { name: 'Todas as Tarefas', icon: Layers },
  { name: 'Próximas', icon: CalendarDays },
  { name: 'Sem Data', icon: CalendarOff },
  { name: 'Concluídas', icon: CircleCheck },
  { name: 'Categorias', icon: Shapes },
];
const pending = computed(() =>
  store.data.tasks.filter((t) => t.status === 'pending' || t.status === 'active'),
);
const doneToday = computed(() =>
  store.data.tasks.filter(
    (t) => t.status === 'done' && t.completedAt && dateKey(new Date(t.completedAt)) === today.value,
  ),
);
const weekStart = computed(() => addDays(today.value, -((now.value.getDay() + 6) % 7)));
const doneWeek = computed(() =>
  store.data.tasks.filter(
    (t) =>
      t.status === 'done' && t.completedAt && dateKey(new Date(t.completedAt)) >= weekStart.value,
  ),
);
const daily = computed(() =>
  pending.value.filter((t) => t.plannedDate === today.value || t.dueDate === today.value),
);
const overdue = computed(() => pending.value.filter((t) => t.dueDate && t.dueDate < today.value));
const suggestions = computed(() =>
  recommend(store.data.tasks, Math.max(1, Number(minutes.value) || 1), now.value),
);
const progress = computed(() =>
  Math.round((doneToday.value.length / (daily.value.length + doneToday.value.length || 1)) * 100),
);
const visible = computed(() => {
  let tasks =
    view.value === 'Concluídas'
      ? store.data.tasks.filter((t) => t.status === 'done')
      : view.value === 'Todas as Tarefas'
        ? store.data.tasks
        : pending.value;
  if (view.value === 'Meu Dia') tasks = daily.value;
  if (view.value === 'Próximas') tasks = tasks.filter((t) => t.dueDate > today.value);
  if (view.value === 'Sem Data') tasks = tasks.filter((t) => !t.dueDate);
  tasks = tasks.filter(
    (t) =>
      (!filter.value || t.categoryId === filter.value) &&
      (!statusFilter.value || t.status === statusFilter.value) &&
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
function navigate(name: string) {
  view.value = name;
  filter.value = '';
  statusFilter.value = '';
  search.value = '';
  mobile.value = false;
}
const categoryName = ref('');
const categoryColor = ref('#7664d8');
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
  const raw = store.blocked
    ? localStorage.getItem('focus.v1')
    : JSON.stringify(store.data, null, 2);
  const url = URL.createObjectURL(new Blob([raw ?? ''], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'focus-backup.json';
  a.click();
  URL.revokeObjectURL(url);
}
</script>
<template>
  <div class="app-shell">
    <aside class="sidebar" :class="{ open: mobile }">
      <a class="brand" href="#" @click.prevent="navigate('Meu Dia')"
        ><span class="brand-mark"><Target :size="25" /></span>focus<span class="brand-dot"
          >.</span
        ></a
      >
      <span class="workspace-label">SEU ESPAÇO PESSOAL</span>
      <nav>
        <button
          v-for="item in nav"
          :key="item.name"
          :class="{ selected: view === item.name }"
          @click="navigate(item.name)"
        >
          <component :is="item.icon" :size="19" />{{ item.name
          }}<span v-if="item.name === 'Meu Dia'" class="nav-count">{{ daily.length }}</span
          ><span v-if="item.name === 'Todas as Tarefas'" class="subtle-count">{{
            pending.length
          }}</span>
        </button>
      </nav>
      <div class="sidebar-categories">
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
        <div class="gentle-note">
          <Coffee :size="20" /><strong>Um passo de cada vez.</strong>
          <p>Você não precisa fazer tudo hoje.</p>
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
        <button class="mobile-menu icon-button" aria-label="Abrir menu" @click="mobile = true">
          <Menu :size="22" /></button
        ><span
          >Meu espaço <ChevronRight :size="14" /> <strong>{{ view }}</strong></span
        >
        <div>
          <span class="local-indicator" :class="{ late: !!store.error }"
            ><i />{{ store.error ? 'Verifique o armazenamento' : 'Seu ritmo, seu espaço' }}</span
          ><button class="top-add" @click="edit()"><Plus :size="18" />Nova tarefa</button>
        </div>
      </header>
      <main>
        <div v-if="store.error" role="alert" class="error-banner">
          {{ store.error }} <button @click="exportData">Exportar dados</button>
        </div>
        <div class="page-heading">
          <div>
            <p class="eyebrow">
              {{
                now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
              }}
            </p>
            <h1 v-if="view === 'Meu Dia'">
              {{
                now.getHours() < 12 ? 'Bom dia' : now.getHours() < 18 ? 'Boa tarde' : 'Boa noite'
              }}
              <span class="sun-emoji">☀</span>
            </h1>
            <h1 v-else>{{ view }}</h1>
            <p>
              {{
                view === 'Meu Dia'
                  ? 'Menos ruído. Mais clareza para o que importa.'
                  : 'Um lugar para organizar seus próximos passos.'
              }}
            </p>
          </div>
          <button class="primary" @click="edit()"><Plus :size="17" /> Nova tarefa</button>
        </div>
        <template v-if="view === 'Meu Dia'">
          <section class="stats">
            <article>
              <span class="stat-icon violet"><Layers :size="19" /></span>
              <div>
                <span>Pendentes</span
                ><strong>{{ pending.length }}<small>tarefas no seu radar</small></strong>
              </div>
            </article>
            <article>
              <span class="stat-icon green"><CircleCheck :size="19" /></span>
              <div>
                <span>Concluídas hoje</span
                ><strong>{{ doneToday.length }}<small>cada passo conta</small></strong>
              </div>
            </article>
            <article>
              <span class="stat-icon orange"><ClockIcon /></span>
              <div>
                <span>Tempo realizado hoje</span
                ><strong
                  >{{ doneToday.reduce((s, t) => s + t.duration, 0)
                  }}<small>minutos estimados</small></strong
                >
              </div>
            </article>
            <article class="progress-stat">
              <div>
                <span>Seu progresso de hoje</span><strong>{{ progress }}<small>%</small></strong>
                <div class="progress-track"><i :style="{ width: progress + '%' }" /></div>
              </div>
              <span class="progress-flower">✳</span>
            </article>
          </section>
          <section class="recommendation">
            <div class="recommendation-top">
              <span class="recommend-label"><Sparkles :size="16" /> UM POUCO DE CLAREZA</span
              ><span class="rule-label">Feito para o seu momento</span>
            </div>
            <div class="recommend-layout">
              <div class="recommend-intro">
                <h2>O que faço agora?</h2>
                <p>
                  Escolha seu tempo. A gente ajuda<br class="desktop-break" />
                  a encontrar o próximo passo.
                </p>
                <div class="time-options">
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
              </div>
              <div v-if="suggestions[0]" class="suggested-task">
                <span class="suggested-tag"
                  ><span /> NOSSA SUGESTÃO
                  <span class="duration">{{ suggestions[0].task.duration }} min</span></span
                >
                <h3>{{ suggestions[0].task.title }}</h3>
                <p>{{ suggestions[0].reason }}</p>
                <div class="suggestion-actions">
                  <button
                    v-if="suggestions[0].task.status !== 'active'"
                    class="primary"
                    @click="
                      store.status(suggestions[0]!.task, 'active');
                      notify('Tarefa em andamento. Um passo de cada vez.');
                    "
                  >
                    <Play :size="14" />Começar tarefa
                  </button>
                  <button
                    v-else
                    class="primary"
                    @click="
                      store.status(suggestions[0]!.task, 'done');
                      notify('Tarefa concluída. Cada passo conta!');
                    "
                  >
                    <Check :size="14" />Finalizar tarefa
                  </button>
                  <span
                    v-if="suggestions[0].task.status === 'active'"
                    class="task-active-badge"
                    role="status"
                  >
                    <span aria-hidden="true" />Em andamento
                  </span>
                  <button class="text-button" @click="alternatives = !alternatives">
                    {{ alternatives ? 'Ocultar' : 'Ver alternativas' }}<ChevronRight :size="15" />
                  </button>
                </div>
              </div>
              <div v-else class="suggested-task empty-recommend">
                <Sparkles :size="25" />
                <h3>
                  {{
                    pending.length ? 'Um pouco mais de tempo?' : 'Abra espaço para o próximo passo.'
                  }}
                </h3>
                <p>
                  {{
                    pending.length
                      ? 'Nenhuma tarefa cabe nesse intervalo. Ajuste o tempo ou aproveite uma pausa.'
                      : 'Adicione uma tarefa e receba uma sugestão pensada para o seu momento.'
                  }}
                </p>
                <button class="text-button" @click="edit()">
                  Adicionar tarefa <Plus :size="15" />
                </button>
              </div>
            </div>
            <div v-if="alternatives && suggestions.length > 1" class="alternatives">
              <button v-for="s in suggestions.slice(1)" :key="s.task.id" @click="edit(s.task)">
                {{ s.task.title }}<span>{{ s.task.duration }} min · {{ s.reason }}</span>
              </button>
            </div>
          </section>
        </template>
        <section v-if="view === 'Categorias'" class="category-panel">
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
        <template v-else>
          <section v-if="view === 'Meu Dia' && overdue.length" class="overdue-panel">
            <div class="section-heading">
              <h2>
                <span class="overdue-dot" /> Merecem atenção
                <span class="count-pill">{{ overdue.length }}</span>
              </h2>
              <span>Retome no seu tempo</span>
            </div>
            <TaskRow
              v-for="task in overdue"
              :key="task.id"
              :task="task"
              :today="today"
              @edit="edit"
              @completed="notify('Tarefa concluída. Cada passo conta!')"
            />
          </section>
          <section class="task-section">
            <div class="section-heading">
              <h2>
                {{
                  view === 'Meu Dia'
                    ? 'Planejado para hoje'
                    : view === 'Todas as Tarefas'
                      ? 'Todas as tarefas'
                      : view
                }}
                <span class="count-pill">{{ visible.length }}</span>
              </h2>
              <span v-if="view === 'Meu Dia'">Vencimento e planejamento, juntos aqui</span>
            </div>
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
              ><select
                v-if="view === 'Todas as Tarefas'"
                v-model="statusFilter"
                aria-label="Filtrar status"
              >
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
                  ><component :is="view === 'Concluídas' ? CircleCheck : Sun" :size="25"
                /></span>
                <h3>
                  {{
                    search || filter
                      ? 'Nenhuma tarefa encontrada'
                      : view === 'Meu Dia'
                        ? 'Um dia com espaço para o que importa.'
                        : 'Tudo começa com um pequeno passo.'
                  }}
                </h3>
                <p>
                  {{
                    search || filter
                      ? 'Experimente ajustar sua busca ou os filtros.'
                      : view === 'Meu Dia'
                        ? 'Crie uma tarefa ou planeje uma existente para hoje.'
                        : 'Suas tarefas aparecerão aqui. Adicione a primeira quando quiser.'
                  }}
                </p>
              </div>
              <button class="add-task-row" @click="edit()">
                <Plus :size="18" /> Adicionar uma tarefa <span>Um passo de cada vez</span>
              </button>
            </div>
          </section>
        </template>
        <section v-if="view === 'Meu Dia'" class="week-summary">
          <div>
            <span class="week-icon"><CircleCheck :size="20" /></span>
            <div>
              <h3>Sua semana, até aqui</h3>
              <p>
                {{ doneWeek.length }} tarefas concluídas ·
                {{ doneWeek.reduce((s, t) => s + t.duration, 0) }} minutos estimados
              </p>
            </div>
          </div>
          <span>Progresso também é respeitar seu ritmo. <span>🌿</span></span>
        </section>
        <footer class="page-footer">
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
      @close="editor = false"
      @saved="
        editor = false;
        notify('Tarefa salva com sucesso');
      "
    />
    <Transition name="toast"
      ><div v-if="toast" role="status" class="toast">
        <Check :size="17" />{{ toast
        }}<button aria-label="Dispensar" @click="toast = ''"><X :size="15" /></button></div
    ></Transition>
  </div>
</template>

<script lang="ts">
import { Clock3 } from 'lucide-vue-next';
export default { components: { ClockIcon: Clock3 } };
</script>
