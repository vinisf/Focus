<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useDialogFocus } from '../composables/useDialogFocus';
import { X, ChevronDown } from 'lucide-vue-next';
import type { Task } from '../types';
import { useTasks } from '../stores/tasks';
import DeleteActivity from './DeleteActivity.vue';
const props = defineProps<{ task: Task | null }>();
const emit = defineEmits<{ close: []; saved: []; deleted: [] }>();
const store = useTasks();
const input = ref<HTMLInputElement>();
const deleteError = ref('');
function remove() {
  if (props.task && store.remove(props.task.id)) emit('deleted');
  else deleteError.value = store.error || 'Não foi possível excluir a tarefa.';
}
const advanced = ref(!!props.task);
const repeat = ref(props.task?.recurrence?.kind ?? '');
const days = ref(props.task?.recurrence?.days ?? [1, 2, 3, 4, 5]);
const form = reactive<Task>(
  props.task
    ? (JSON.parse(JSON.stringify(props.task)) as Task)
    : {
        id: crypto.randomUUID(),
        title: '',
        description: '',
        categoryId: store.data.categories[0]?.id ?? '',
        dueDate: '',
        time: '',
        plannedDate: '',
        priority: 'medium',
        importance: 'medium',
        duration: 30,
        status: 'pending',
        createdAt: new Date().toISOString(),
        completedAt: null,
        recurrence: null,
      },
);
const { trapFocus } = useDialogFocus(input);
function submit() {
  if (form.mandatory && (!form.scheduledTime || !(form.plannedDate || form.dueDate))) {
    deleteError.value = 'Informe o dia e o horário de início do compromisso obrigatório.';
    return;
  }
  if (
    !form.title.trim() ||
    !form.categoryId ||
    !Number.isFinite(form.duration) ||
    form.duration < 1 ||
    (repeat.value === 'custom' && !days.value.length)
  )
    return;
  form.title = form.title.trim();
  form.recurrence = repeat.value
    ? { kind: repeat.value as 'daily' | 'weekly' | 'custom', days: days.value }
    : null;
  store.save({ ...form });
  emit('saved');
}
</script>
<template>
  <div class="overlay" @click.self="emit('close')" @keydown.esc="emit('close')">
    <section
      class="modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="editor-title"
      @keydown.tab="trapFocus"
    >
      <header>
        <h2 id="editor-title">{{ task ? 'Editar tarefa' : 'Um novo passo' }}</h2>
        <button aria-label="Fechar" @click="emit('close')"><X :size="20" /></button>
      </header>
      <form @submit.prevent="submit">
        <label
          >Título<input
            ref="input"
            v-model="form.title"
            data-first
            required
            maxlength="180"
            placeholder="O que você quer realizar?"
        /></label>
        <div class="form-grid">
          <label
            >Categoria<select v-model="form.categoryId" required>
              <option v-for="c in store.data.categories" :key="c.id" :value="c.id">
                {{ c.name }}
              </option>
            </select></label
          ><label
            >Prioridade<select v-model="form.priority">
              <option value="low">Baixa</option>
              <option value="medium">Média</option>
              <option value="high">Alta</option>
              <option value="urgent">Urgente</option>
            </select></label
          >
        </div>
        <div class="form-grid">
          <label
            >Vencimento <small>Opcional</small><input v-model="form.dueDate" type="date" /></label
          ><label
            >Dia planejado <small>Quando fazer</small><input v-model="form.plannedDate" type="date"
          /></label>
        </div>
        <button
          type="button"
          class="text-button"
          :aria-expanded="advanced"
          @click="advanced = !advanced"
        >
          <ChevronDown :size="16" /> Mais detalhes
        </button>
        <div v-if="advanced" class="advanced">
          <label>Descrição<textarea v-model="form.description" rows="3" /></label>
          <label v-if="form.integrationName"
            >Próxima ação<input v-model="form.nextAction" maxlength="240"
          /></label>
          <label class="planning-check"
            ><input v-model="form.blocked" type="checkbox" />Aguardando uma dependência (fora das
            sugestões)</label
          >
          <div class="form-grid">
            <label
              >Estimativa (min)<input
                v-model.number="form.duration"
                type="number"
                min="1"
                max="10080"
                required /></label
            ><label
              >Importância<select v-model="form.importance">
                <option value="low">Baixa</option>
                <option value="medium">Média</option>
                <option value="high">Alta</option>
              </select></label
            ><label
              >Horário limite<input
                v-model="form.time"
                type="time"
                @input="form.deadlineTime = form.time" /></label
            ><label
              >Horário planejado de início<input v-model="form.scheduledTime" type="time" /></label
            ><label class="planning-check"
              ><input v-model="form.mandatory" type="checkbox" />Compromisso com horário
              obrigatório</label
            ><label
              >Recorrência<select v-model="repeat">
                <option value="">Não repetir</option>
                <option value="daily">Diária</option>
                <option value="weekly">Semanal</option>
                <option value="custom">Dias da semana</option>
              </select></label
            >
          </div>
          <fieldset v-if="repeat === 'custom'">
            <legend>Repetir em pelo menos um dia</legend>
            <label
              v-for="(day, i) in ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']"
              :key="day"
              class="day-choice"
              ><input v-model="days" type="checkbox" :value="i" />{{ day }}</label
            >
          </fieldset>
        </div>
        <DeleteActivity
          v-if="task"
          label="Excluir tarefa"
          :description="`Excluir “${task.title}”? Apenas esta tarefa será apagada; outras ocorrências já criadas serão mantidas.`"
          :disabled="store.blocked"
          @confirm="remove"
        />
        <p v-if="deleteError" role="alert" class="late">{{ deleteError }}</p>
        <footer>
          <button type="button" @click="emit('close')">Cancelar</button
          ><button data-last class="primary" :disabled="repeat === 'custom' && !days.length">
            Salvar tarefa
          </button>
        </footer>
      </form>
    </section>
  </div>
</template>
