<script setup lang="ts">
import { ref } from 'vue';
import {
  exportFullBackup,
  parseBackup,
  restoreBackup,
  snapshot,
  RESTORE_JOURNAL,
  type FullBackup,
} from '../services/fullBackup';
const error = ref('');
const pending = ref<FullBackup | null>(null);
const expected = ref<FullBackup | null>(null);
const confirmed = ref(false);
const restored = ref(false);
let selection = 0;
function download(recovery = false) {
  try {
    const raw = recovery ? JSON.stringify(snapshot(), null, 2) : exportFullBackup();
    const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = recovery ? 'focus-recuperacao.json' : 'focus-backup-completo.json';
    a.click();
    URL.revokeObjectURL(url);
    error.value = '';
  } catch {
    error.value =
      'Não foi possível exportar o backup completo. Confira o armazenamento ou exporte uma cópia de recuperação dos dados originais.';
  }
}
async function select(event: Event) {
  const current = ++selection;
  pending.value = null;
  expected.value = null;
  confirmed.value = false;
  error.value = '';
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  try {
    if (file.size > 20 * 1024 * 1024) throw Error('Backup maior que 20 MB.');
    const raw = await file.text();
    if (current !== selection) return;
    pending.value = parseBackup(raw);
    expected.value = snapshot();
  } catch (e) {
    if (current !== selection) return;
    pending.value = null;
    expected.value = null;
    error.value = e instanceof Error ? e.message : 'Não foi possível ler o arquivo.';
  }
  input.value = '';
}
function restore() {
  if (!pending.value || !expected.value) return;
  try {
    restoreBackup(pending.value, expected.value, confirmed.value);
    restored.value = true;
    location.reload();
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Não foi possível importar.';
    // Prevent stores with stale in-memory values from writing over a pending rollback.
    try {
      if (localStorage.getItem(RESTORE_JOURNAL) !== null) location.reload();
    } catch {
      /* The error remains visible. */
    }
  }
}
</script>
<template>
  <section class="life-planning" aria-label="Backup completo">
    <p>
      Backup local de tarefas, categorias, hábitos, metas, semana, rotina, preferências, sessões,
      histórico e caches de integrações. Credenciais não são incluídas. Guarde o arquivo em local
      seguro.
    </p>
    <p v-if="error" role="alert" class="error-banner">{{ error }}</p>
    <button @click="download()">Exportar backup completo</button>
    <details>
      <summary>Recuperar dados ilegíveis</summary>
      <p>
        A cópia de recuperação preserva os dados originais, inclusive registros inválidos. Eles
        precisam ser corrigidos antes de importar.
      </p>
      <button @click="download(true)">Exportar cópia de recuperação</button>
    </details>
    <label
      >Selecionar backup completo<input
        type="file"
        accept="application/json,.json"
        :disabled="restored"
        @change="select"
    /></label>
    <div v-if="pending && !restored">
      <p>
        Arquivo validado. A importação substituirá todos os dados locais incluídos no backup,
        inclusive metas e tarefas. Dados ausentes no arquivo serão removidos. A página será
        recarregada. Feche outras abas do Focus antes de continuar.
      </p>
      <label
        ><input v-model="confirmed" type="checkbox" />Confirmo a substituição dos meus dados
        locais.</label
      >
      <button :disabled="!confirmed" @click="restore">Importar e substituir dados</button>
      <button
        @click="
          pending = null;
          confirmed = false;
        "
      >
        Cancelar importação
      </button>
    </div>
    <p v-if="restored" role="status">Backup importado. Recarregue a página para continuar.</p>
  </section>
</template>
