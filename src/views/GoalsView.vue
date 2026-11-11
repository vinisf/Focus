<script setup lang="ts">
import { ref } from 'vue';
import { useLifePlanning } from '../stores/lifePlanning';
import { useTasks } from '../stores/tasks';
import { goalProgress } from '../services/lifePlanningRepository';
import type { Goal } from '../types/lifePlanning';
import PersonalPlanImport from '../components/PersonalPlanImport.vue';
const store = useLifePlanning();
const tasks = useTasks();
const areaName = ref('');
const areaId = ref('');
const draft = ref<Goal | null>(null);
const milestoneTitle = ref('');
function edit(goal?: unknown) {
  draft.value = goal
    ? JSON.parse(JSON.stringify(goal))
    : {
        id: crypto.randomUUID(),
        areaId: store.data.areas[0]?.id ?? '',
        title: '',
        description: '',
        horizon: 'short',
        dueDate: '',
        status: 'active',
        milestones: [],
        taskIds: [],
      };
  milestoneTitle.value = '';
}
function save() {
  if (draft.value && store.saveGoal(draft.value)) draft.value = null;
}
function saveArea() {
  if (store.saveArea({ id: areaId.value || crypto.randomUUID(), name: areaName.value.trim() })) {
    areaName.value = '';
    areaId.value = '';
  }
}
function removeGoal(id: string) {
  if (confirm('Excluir esta meta e seus marcos? As tarefas serão preservadas.'))
    store.removeGoal(id);
}
function addMilestone() {
  if (milestoneTitle.value.trim() && draft.value) {
    draft.value.milestones.push({
      id: crypto.randomUUID(),
      title: milestoneTitle.value.trim(),
      done: false,
    });
    milestoneTitle.value = '';
  }
}
</script>
<template>
  <section class="life-planning" aria-label="Metas">
    <p>Conecte suas tarefas a objetivos e acompanhe marcos verificáveis.</p>
    <p v-if="store.error" class="error-banner" role="alert">{{ store.error }}</p>
    <PersonalPlanImport />
    <fieldset :disabled="store.blocked">
      <legend>Metas e áreas da vida</legend>
      <form class="life-inline" @submit.prevent="saveArea">
        <label>Nome da área<input v-model="areaName" required maxlength="200" /></label>
        <button class="primary">{{ areaId ? 'Salvar área' : 'Criar área' }}</button>
        <button
          v-if="areaId"
          type="button"
          @click="
            areaId = '';
            areaName = '';
          "
        >
          Cancelar edição
        </button>
      </form>
      <ul>
        <li v-for="area in store.data.areas" :key="area.id" class="life-inline">
          {{ area.name
          }}<button
            @click="
              areaId = area.id;
              areaName = area.name;
            "
          >
            Editar área {{ area.name }}
          </button>
          <button @click="store.removeArea(area.id)">Excluir área {{ area.name }}</button>
        </li>
      </ul>
      <p v-if="!store.data.areas.length">
        Crie uma área para cadastrar sua primeira meta. Nenhuma meta é preenchida automaticamente.
      </p>
      <button class="primary" :disabled="!store.data.areas.length" @click="edit()">
        Nova meta
      </button>
      <form v-if="draft" class="life-form" aria-label="Editar meta" @submit.prevent="save">
        <h2>
          {{ store.data.goals.some((g) => g.id === draft!.id) ? 'Editar meta' : 'Nova meta' }}
        </h2>
        <label>Título<input v-model="draft.title" required maxlength="200" /></label>
        <label>Descrição<textarea v-model="draft.description" maxlength="10000" /></label>
        <label
          >Área<select v-model="draft.areaId" required>
            <option v-for="area in store.data.areas" :key="area.id" :value="area.id">
              {{ area.name }}
            </option>
          </select></label
        >
        <label
          >Horizonte<select v-model="draft.horizon">
            <option value="short">Curto prazo</option>
            <option value="medium">Médio prazo</option>
            <option value="long">Longo prazo</option>
          </select></label
        >
        <label>Prazo opcional<input v-model="draft.dueDate" type="date" /></label>
        <label
          >Status<select v-model="draft.status">
            <option value="active">Em andamento</option>
            <option value="paused">Pausada</option>
            <option value="done">Concluída</option>
            <option value="cancelled">Cancelada</option>
          </select></label
        >
        <fieldset>
          <legend>Marcos verificáveis</legend>
          <div v-for="milestone in draft.milestones" :key="milestone.id" class="life-inline">
            <label><input v-model="milestone.done" type="checkbox" /> Concluído</label>
            <input
              v-model="milestone.title"
              aria-label="Descrição do marco"
              required
              maxlength="200"
            />
            <button
              type="button"
              @click="draft.milestones = draft.milestones.filter((m) => m.id !== milestone.id)"
            >
              Remover marco
            </button>
          </div>
          <label
            >Novo marco<input
              v-model="milestoneTitle"
              maxlength="200"
              @keydown.enter.prevent="addMilestone"
          /></label>
          <button type="button" @click="addMilestone">Adicionar marco</button>
        </fieldset>
        <fieldset>
          <legend>Tarefas existentes</legend>
          <p v-if="!tasks.data.tasks.length">
            Cadastre tarefas na tela Tarefas para relacioná-las.
          </p>
          <label v-for="task in tasks.data.tasks" :key="task.id"
            ><input v-model="draft.taskIds" type="checkbox" :value="task.id" />{{
              task.title
            }}</label
          >
          <p v-if="draft.taskIds.some((id) => !tasks.data.tasks.some((t) => t.id === id))">
            Há vínculos com tarefas excluídas.
            <button
              type="button"
              @click="
                draft.taskIds = draft.taskIds.filter((id) =>
                  tasks.data.tasks.some((t) => t.id === id),
                )
              "
            >
              Limpar vínculos indisponíveis
            </button>
          </p>
        </fieldset>
        <div class="life-inline">
          <button class="primary">Salvar meta</button
          ><button type="button" @click="draft = null">Cancelar</button>
        </div>
      </form>
      <p v-if="!store.data.goals.length">
        Suas metas aparecerão aqui. O progresso será calculado somente pelos marcos concluídos.
      </p>
      <div class="life-cards">
        <article v-for="goal in store.data.goals" :key="goal.id">
          <h2>{{ goal.title }}</h2>
          <p>
            {{ store.data.areas.find((a) => a.id === goal.areaId)?.name }} ·
            {{
              {
                active: 'Em andamento',
                paused: 'Pausada',
                done: 'Concluída',
                cancelled: 'Cancelada',
              }[goal.status]
            }}
          </p>
          <p>{{ goal.description }}</p>
          <p v-if="goal.dueDate">Prazo: {{ goal.dueDate }}</p>
          <p>
            {{ goal.milestones.filter((m) => m.done).length }}/{{ goal.milestones.length }} marcos
            concluídos <span v-if="goal.milestones.length">· {{ goalProgress(goal) }}%</span
            ><span v-else>· Sem marcos definidos</span>
          </p>
          <ul>
            <li v-for="m in goal.milestones" :key="m.id">{{ m.done ? '✓' : '○' }} {{ m.title }}</li>
          </ul>
          <ul>
            <li v-for="id in goal.taskIds" :key="id">
              {{ tasks.data.tasks.find((t) => t.id === id)?.title ?? 'Tarefa indisponível' }}
            </li>
          </ul>
          <div class="life-inline">
            <button @click="edit(goal)">Editar meta {{ goal.title }}</button
            ><button @click="removeGoal(goal.id)">Excluir meta {{ goal.title }}</button>
          </div>
        </article>
      </div>
    </fieldset>
  </section>
</template>
