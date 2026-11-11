<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { useLifePlanning } from '../stores/lifePlanning';
import type { WeeklyBlock } from '../types/lifePlanning';
const props = defineProps<{ block: WeeklyBlock }>();
const emit = defineEmits<{ saved: []; cancel: [] }>();
const store = useLifePlanning();
const draft = ref<WeeklyBlock>(JSON.parse(JSON.stringify(props.block)));
const form = ref<HTMLFormElement>();
watch(
  () => props.block,
  async (block) => {
    draft.value = JSON.parse(JSON.stringify(block));
    await nextTick();
    form.value?.querySelector('input')?.focus();
  },
  { immediate: true },
);
function save() {
  if (store.saveBlock(draft.value)) emit('saved');
}
</script>
<template>
  <form ref="form" class="life-form" aria-label="Editar bloco" @submit.prevent="save">
    <h2>Editar / replanejar bloco</h2>
    <p v-if="store.error" role="alert" class="error-banner">{{ store.error }}</p>
    <fieldset :disabled="store.blocked">
      <legend>Dados do bloco</legend>
      <label>Título<input v-model="draft.title" required maxlength="200" /></label>
      <label>Descrição opcional<textarea v-model="draft.description" maxlength="10000" /></label>
      <label>Data<input v-model="draft.date" type="date" required /></label>
      <label
        >Tipo<select v-model="draft.kind">
          <option value="flexible">Flexível · sugestão</option>
          <option value="fixed">Fixo · compromisso confirmado</option>
        </select></label
      >
      <p>
        Blocos flexíveis são sugestões. Escolha fixo para confirmar um compromisso. Para deixar um
        flexível sem horário, limpe início e fim. Divida blocos que cruzam a meia-noite em dois
        dias.
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
        ><button type="button" @click="emit('cancel')">Cancelar edição</button>
      </div>
    </fieldset>
  </form>
</template>
