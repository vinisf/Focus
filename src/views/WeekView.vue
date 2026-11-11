<script setup lang="ts">
import { computed, ref } from 'vue';
import { useLifePlanning } from '../stores/lifePlanning';
import { planningToday, weekDays } from '../services/lifePlanningRepository';
import { addDays } from '../utils/dates';
import type { WeeklyBlock } from '../types/lifePlanning';
const store = useLifePlanning();
const selected = ref(planningToday(store.data.timezone));
const days = computed(() => weekDays(selected.value));
const draft = ref<WeeklyBlock | null>(null);
const timezone = ref(store.data.timezone);
const labels = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
function edit(block?: unknown, date = selected.value) {
  draft.value = block
    ? JSON.parse(JSON.stringify(block))
    : {
        id: crypto.randomUUID(),
        title: '',
        date,
        kind: 'flexible',
        start: '',
        end: '',
        status: 'planned',
        goalId: '',
      };
}
function save() {
  if (draft.value && store.saveBlock(draft.value)) draft.value = null;
}
function cancel(block: unknown) {
  const b = JSON.parse(JSON.stringify(block)) as WeeklyBlock;
  if (confirm('Cancelar este bloco? Nenhuma tarefa será reagendada.'))
    store.saveBlock({ ...b, status: 'cancelled' });
}
function remove(id: string) {
  if (confirm('Excluir este bloco da semana?')) store.removeBlock(id);
}
</script>
<template>
  <section class="life-planning" aria-label="Semana">
    <p>
      Compromissos fixos e blocos flexíveis, inclusive sem horário. Remarque manualmente ao editar a
      data e os horários.
    </p>
    <p v-if="store.error" class="error-banner" role="alert">{{ store.error }}</p>
    <fieldset :disabled="store.blocked">
      <legend>Planejamento semanal</legend>
      <form class="life-inline" @submit.prevent="store.setTimezone(timezone)">
        <label
          >Fuso do planejamento<input
            v-model="timezone"
            required
            placeholder="America/Fortaleza" /></label
        ><button>Salvar fuso</button>
      </form>
      <p>
        Fuso: {{ store.data.timezone }}. Datas e horários são locais ao planejamento. Alterar o fuso
        não desloca blocos existentes. As tarefas e a rotina atuais mantêm seus horários.
      </p>
      <div class="life-inline">
        <button @click="selected = addDays(selected, -7)">Semana anterior</button
        ><label>Dia da semana<input v-model="selected" required type="date" /></label
        ><button @click="selected = addDays(selected, 7)">Próxima semana</button
        ><button class="primary" @click="edit()">Novo bloco</button>
      </div>
      <form v-if="draft" class="life-form" aria-label="Editar bloco" @submit.prevent="save">
        <h2>Planejar bloco</h2>
        <label>Título<input v-model="draft.title" required maxlength="200" /></label>
        <label>Data<input v-model="draft.date" type="date" required /></label>
        <label
          >Tipo<select v-model="draft.kind">
            <option value="flexible">Flexível</option>
            <option value="fixed">Compromisso fixo</option>
          </select></label
        >
        <p>
          Para deixar um bloco flexível sem horário, limpe início e fim. Blocos com horário não
          podem se sobrepor.
        </p>
        <label
          >Início<input
            v-model="draft.start"
            type="time"
            :required="draft.kind === 'fixed' || !!draft.end"
        /></label>
        <label
          >Fim<input
            v-model="draft.end"
            type="time"
            :required="draft.kind === 'fixed' || !!draft.start"
        /></label>
        <label
          >Meta opcional<select v-model="draft.goalId">
            <option value="">Sem meta</option>
            <option v-for="goal in store.data.goals" :key="goal.id" :value="goal.id">
              {{ goal.title }}
            </option>
          </select></label
        >
        <label
          >Status<select v-model="draft.status">
            <option value="planned">Planejado</option>
            <option value="cancelled">Cancelado</option>
          </select></label
        >
        <div class="life-inline">
          <button class="primary">Salvar bloco</button
          ><button type="button" @click="draft = null">Cancelar edição</button>
        </div>
      </form>
      <div class="week-grid">
        <section v-for="(day, index) in days" :key="day" :aria-label="labels[index]">
          <h2>{{ labels[index] }}</h2>
          <p>{{ day }}</p>
          <button @click="edit(undefined, day)">Adicionar em {{ labels[index] }}</button>
          <p v-if="!store.data.blocks.some((b) => b.date === day)">Sem blocos.</p>
          <article
            v-for="block in [...store.data.blocks]
              .filter((b) => b.date === day)
              .sort((a, b) => a.start.localeCompare(b.start))"
            :key="block.id"
          >
            <h3>{{ block.title }}</h3>
            <p>{{ block.start ? `${block.start}–${block.end}` : 'Sem horário fechado' }}</p>
            <p>
              {{ block.kind === 'fixed' ? 'Fixo' : 'Flexível' }} ·
              {{ block.status === 'cancelled' ? 'Cancelado' : 'Planejado' }}
            </p>
            <p v-if="block.goalId">
              {{ store.data.goals.find((g) => g.id === block.goalId)?.title }}
            </p>
            <button @click="edit(block)">Editar / mover {{ block.title }}</button
            ><button v-if="block.status !== 'cancelled'" @click="cancel(block)">
              Cancelar bloco</button
            ><button @click="remove(block.id)">Excluir bloco</button>
          </article>
        </section>
      </div>
    </fieldset>
  </section>
</template>
