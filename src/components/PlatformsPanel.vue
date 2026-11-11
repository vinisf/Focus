<script setup lang="ts">
import { computed, ref } from 'vue';
import { usePlatforms } from '../stores/platforms';
import { useClock } from '../composables/useClock';
import { usePlanning } from '../stores/planning';
import PlatformCard from './PlatformCard.vue';
import WorkSessionPanel from './WorkSessionPanel.vue';
import DeleteActivity from './DeleteActivity.vue';
import ExcelTaskImport from './ExcelTaskImport.vue';

defineProps<{ mode: 'dashboard' | 'settings' | 'list' }>();
const store = usePlatforms();
const planning = usePlanning();
const now = useClock();
const name = ref('');
const search = ref('');
const archived = ref(false);
const page = ref(1);
const message = ref('');
const filtered = computed(() =>
  store.data.platforms.filter(
    (p) =>
      (archived.value || !p.archived) &&
      p.name.toLocaleLowerCase().includes(search.value.toLocaleLowerCase()),
  ),
);
function create() {
  if (store.create(name.value)) name.value = '';
}
function clearAll() {
  if (store.clearAll()) message.value = 'Todas as integrações de plataformas foram apagadas.';
}
</script>
<template>
  <section class="platforms-panel" aria-label="Integrações de Plataformas">
    <h2>Integrações de Plataformas</h2>
    <ExcelTaskImport />
    <details v-if="mode !== 'dashboard'">
      <summary>Cadastro separado de plataformas (opcional)</summary>
      <p>Os cadastros anteriores continuam aqui. A planilha agora cria tarefas diretamente.</p>
      <p v-if="store.error" role="alert">{{ store.error }}</p>
      <p aria-live="polite">{{ message }}</p>
      <DeleteActivity
        v-if="store.data.platforms.length"
        label="Apagar todas as integrações de plataformas"
        :description="`Serão apagadas as ${store.data.platforms.length} plataformas cadastradas, incluindo arquivadas, anotações e etapas. Tarefas, hábitos, chamados IEMA e histórico de sessões serão preservados.`"
        :disabled="store.blocked || planning.running?.source === 'platform'"
        @confirm="clearAll"
      />
      <p v-if="planning.running?.source === 'platform'">
        Encerre a sessão de integração em andamento para apagar as plataformas.
      </p>
      <form @submit.prevent="create">
        <label>Nome da nova plataforma<input v-model.trim="name" required /></label
        ><button :disabled="store.blocked">Cadastrar manualmente</button>
      </form>
      <template v-if="mode === 'list'">
        <WorkSessionPanel :now="now" />
        <label>Buscar plataforma<input v-model="search" type="search" @input="page = 1" /></label>
        <label><input v-model="archived" type="checkbox" />Mostrar arquivadas</label>
        <PlatformCard
          v-for="platform in filtered.slice(0, page * 20)"
          :key="platform.key"
          :platform="platform"
        />
        <button v-if="page * 20 < filtered.length" @click="page++">Mostrar mais plataformas</button>
      </template>
    </details>
  </section>
</template>
<style scoped>
.platforms-panel {
  padding: 22px;
  border: 1px solid var(--line);
  border-radius: 16px;
  margin: 16px 0;
  background: var(--panel);
  overflow-wrap: anywhere;
}
h2 {
  font-size: 20px;
}
p {
  font-size: 13px;
  margin: 10px 0;
}
label {
  display: grid;
  gap: 6px;
  margin: 14px 0;
  font-size: 13px;
}
input:not([type='checkbox']),
select,
textarea {
  width: 100%;
  min-width: 0;
  padding: 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--input);
  color: inherit;
}
textarea {
  resize: vertical;
}
fieldset {
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: 12px;
  min-width: 0;
}
legend {
  font-size: 13px;
}
summary {
  cursor: pointer;
  font-size: 13px;
}
.sheet-actions,
.sheet-counts {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin: 14px 0;
}
.sheet-counts {
  font-size: 13px;
}
button {
  padding: 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
}
button:disabled {
  opacity: 0.5;
}
.import-row {
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 12px;
  margin: 12px 0;
}
input[type='checkbox'] {
  width: auto;
}
</style>
