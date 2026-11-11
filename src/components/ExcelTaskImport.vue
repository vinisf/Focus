<script setup lang="ts">
import { computed, ref } from 'vue';
import { useTasks } from '../stores/tasks';
import { defaultColors, parseExcel } from '../services/integrations/excel/import';
import type { ColorMapping } from '../services/integrations/excel/import';
import { platformStatuses } from '../types/platforms';
import DeleteActivity from './DeleteActivity.vue';

const tasks = useTasks();
const reading = ref(false);
const message = ref('');
const error = ref('');
const sheet = ref(1);
const header = ref(1);
const count = computed(() => tasks.data.tasks.filter((t) => t.integrationName).length);
async function selectFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file || reading.value || tasks.blocked) return;
  reading.value = true;
  message.value = '';
  error.value = '';
  try {
    if (!/\.xlsx$/i.test(file.name) || file.size > 10 * 1024 * 1024) throw new Error();
    let mapping: ColorMapping = { ...defaultColors };
    try {
      const saved = JSON.parse(localStorage.getItem('focus.platform-colors.v1') ?? 'null');
      if (
        saved &&
        typeof saved === 'object' &&
        !Array.isArray(saved) &&
        Object.entries(saved).every(
          ([key, value]) =>
            (key === 'none' || /^#[0-9A-F]{6}$/.test(key)) &&
            platformStatuses.includes(value as (typeof platformStatuses)[number]),
        )
      )
        mapping = saved;
    } catch {
      /* Optional color configuration. */
    }
    const rows = await parseExcel(await file.arrayBuffer(), mapping, sheet.value, header.value);
    const added = tasks.importIntegrations(rows);
    if (added === null) {
      error.value = tasks.error;
      return;
    }
    const pending = rows.filter((r) => r.status === 'pending').length;
    message.value = `${added} tarefas adicionadas · ${pending - added} já existentes ou repetidas · ${rows.length - pending} ignoradas por status. Veja sua lista de tarefas e as sugestões em Meu Dia.`;
  } catch {
    error.value =
      'Não foi possível importar o XLSX. Confira a aba, o cabeçalho Plataforma na primeira coluna e o limite de 10 MB. Nenhuma tarefa foi adicionada.';
  } finally {
    reading.value = false;
    input.value = '';
  }
}
function clear() {
  error.value = '';
  message.value = '';
  if (tasks.clearIntegrations())
    message.value = 'Tarefas de integração apagadas. Suas outras tarefas foram preservadas.';
  else error.value = tasks.error;
}
</script>
<template>
  <section class="excel-task-import" aria-label="Importar integrações para tarefas">
    <h3>Planilha → lista de tarefas</h3>
    <p>
      Anexe o Excel e as pendentes entram nas suas tarefas com 30 minutos cada, sem data de entrega.
      Você pode fazer ou adiar, no seu ritmo.
    </p>
    <label
      >Quantas integrações sugerir por dia?
      <select
        :value="tasks.data.integrationDailyLimit ?? 2"
        :disabled="tasks.blocked || reading"
        @change="
          tasks.integrationLimit(Number(($event.target as HTMLSelectElement).value) as 1 | 2)
        "
      >
        <option :value="1">Uma por dia</option>
        <option :value="2">Duas por dia</option>
      </select>
    </label>
    <label
      >Anexar planilha Excel<input
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        :disabled="reading || tasks.blocked"
        @change="selectFile"
    /></label>
    <p v-if="reading" role="status">Importando pendentes para suas tarefas…</p>
    <p v-if="error || tasks.error" role="alert">{{ error || tasks.error }}</p>
    <p aria-live="polite">{{ message }}</p>
    <details>
      <summary>Opções da planilha</summary>
      <label
        >Número da aba<input v-model.number="sheet" type="number" min="1" :disabled="reading"
      /></label>
      <label
        >Linha do cabeçalho<input v-model.number="header" type="number" min="1" :disabled="reading"
      /></label>
      <p>
        Somente o nome das plataformas pendentes é usado. Login, Senha e outras colunas não entram
        nas tarefas. Status desconhecidos são ignorados. A leitura é local e reanexar o arquivo não
        duplica tarefas nem reabre as concluídas.
      </p>
    </details>
    <DeleteActivity
      v-if="count"
      label="Apagar tarefas de integração"
      :description="`Serão apagadas ${count} tarefas importadas de integrações, incluindo concluídas. Suas outras tarefas, hábitos e chamados IEMA serão preservados.`"
      :disabled="tasks.blocked || reading"
      @confirm="clear"
    />
  </section>
</template>
<style scoped>
label {
  display: grid;
  gap: 8px;
  margin: 14px 0;
  font-size: 13px;
}
input,
select {
  width: 100%;
  min-width: 0;
  padding: 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--input);
  color: inherit;
}
p {
  font-size: 13px;
  line-height: 1.6;
  margin: 10px 0;
}
summary {
  cursor: pointer;
  font-size: 13px;
}
h3 {
  margin: 12px 0;
}
</style>
