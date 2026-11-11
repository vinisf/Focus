<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { useLifePlanning } from '../stores/lifePlanning';
import { planningToday } from '../services/lifePlanningRepository';
import { dailyTimeline } from '../utils/dailyTimeline';
import type { WeeklyBlock } from '../types/lifePlanning';
import WeeklyBlockEditor from './WeeklyBlockEditor.vue';
const props = defineProps<{ now: Date }>();
const store = useLifePlanning();
const selected = ref('');
const date = computed(() => selected.value || planningToday(store.data.timezone, props.now));
const items = computed(() => dailyTimeline(store.data, date.value));
const editing = ref<WeeklyBlock | null>(null);
const root = ref<HTMLElement>();
function edit(block: unknown) {
  editing.value = JSON.parse(JSON.stringify(block));
}
async function closeEditor() {
  const id = editing.value?.id;
  editing.value = null;
  await nextTick();
  const action = Array.from(
    root.value?.querySelectorAll<HTMLButtonElement>('button[data-edit-block]') ?? [],
  ).find((button) => button.dataset.editBlock === id);
  (action ?? root.value?.querySelector<HTMLInputElement>('input[type=date]'))?.focus();
}
</script>
<template>
  <section ref="root" class="life-planning daily-timeline" aria-label="Linha do tempo diária">
    <div class="timeline-heading">
      <div>
        <h2>Linha do tempo diária</h2>
        <p>Seu dia, um bloco por vez.</p>
      </div>
      <div class="life-inline">
        <label
          >Dia da linha do tempo<input
            :value="date"
            type="date"
            aria-description="Datas no fuso indicado nesta linha do tempo"
            @input="selected = ($event.target as HTMLInputElement).value" /></label
        ><button
          @click="
            selected = '';
            editing = null;
          "
        >
          Hoje
        </button>
      </div>
    </div>
    <p>Data: {{ date }} · Fuso: {{ store.data.timezone }}</p>
    <p>
      Flexíveis são sugestões; fixos são compromissos confirmados. Editar um bloco não reagenda
      tarefas ou rotina.
    </p>
    <p v-if="store.error" role="alert" class="error-banner">{{ store.error }}</p>
    <WeeklyBlockEditor v-if="editing" :block="editing" @saved="closeEditor" @cancel="closeEditor" />
    <ol class="timeline-list" aria-label="Blocos com horário">
      <li
        v-for="block in items.timed"
        :key="block.id"
        :class="{ 'timeline-fixed': block.kind === 'fixed' }"
      >
        <time :datetime="`${block.date}T${block.start}`"
          >{{ block.start }}<span>até {{ block.end }}</span></time
        >
        <article>
          <span class="timeline-kind">{{
            block.kind === 'fixed' ? 'Compromisso confirmado' : 'Sugestão flexível'
          }}</span>
          <h3>{{ block.title }}</h3>
          <p v-if="block.description" class="timeline-description">{{ block.description }}</p>
          <button :data-edit-block="block.id" :disabled="store.blocked" @click="edit(block)">
            Editar / replanejar {{ block.title }}
          </button>
        </article>
      </li>
    </ol>
    <p v-if="!items.timed.length">Nenhum bloco com horário neste dia.</p>
    <h3>Flexíveis sem horário</h3>
    <ul class="timeline-flexible" aria-label="Blocos flexíveis sem horário">
      <li v-for="block in items.flexible" :key="block.id">
        <article>
          <span class="timeline-kind">Sugestão · sem horário fechado</span>
          <h3>{{ block.title }}</h3>
          <p v-if="block.description" class="timeline-description">{{ block.description }}</p>
          <button :data-edit-block="block.id" :disabled="store.blocked" @click="edit(block)">
            Editar / replanejar {{ block.title }}
          </button>
        </article>
      </li>
    </ul>
    <p v-if="!items.flexible.length">
      Nenhuma sugestão sem horário neste dia. Você pode criar blocos em Semana.
    </p>
    <p class="timeline-note">
      Blocos que cruzam a meia-noite precisam ser divididos na Semana. Tarefas, hábitos e rotina
      continuam nas telas atuais.
    </p>
  </section>
</template>
