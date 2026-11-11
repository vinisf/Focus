<script setup lang="ts">
import { computed, ref } from 'vue';
import { Capacitor } from '@capacitor/core';
import { useIema } from '../stores/iema';
const props = defineProps<{ mode: 'dashboard' | 'settings' | 'tickets' }>();
const iema = useIema();
const url = ref(iema.data.baseUrl);
const token = ref('');
const search = ref('');
const tickets = computed(() =>
  iema.myActiveTickets.filter((t) =>
    `${t.id} ${t.title}`.toLocaleLowerCase().includes(search.value.toLocaleLowerCase()),
  ),
);
async function save() {
  const value = token.value;
  token.value = '';
  await iema.configure(url.value, value);
}
function date(value: string | null) {
  return value ? new Date(value).toLocaleString('pt-BR') : 'Não informada';
}
</script>
<template>
  <section class="iema-panel" aria-label="Suporte IEMA">
    <h2>{{ props.mode === 'tickets' ? 'Chamados IEMA' : 'Suporte IEMA' }}</h2>
    <p aria-live="polite">{{ iema.status }} · {{ iema.data.enabled ? 'Ativada' : 'Desativada' }}</p>
    <p>Última atualização: {{ date(iema.data.lastSync) }}</p>
    <p v-if="iema.data.lastSync">
      Esta é a sua última cópia dos chamados. Atualize para conferir as novidades no IEMA.
    </p>
    <p v-if="iema.error" role="alert">{{ iema.error }} A sincronização anterior foi preservada.</p>
    <p>{{ iema.myActiveTickets.length }} dos meus chamados em atendimento</p>
    <div class="iema-actions">
      <button
        class="primary"
        :disabled="iema.busy || !iema.data.enabled || iema.blocked"
        @click="iema.sync()"
      >
        {{ iema.busy ? 'Aguarde…' : 'Sincronizar IEMA' }}
      </button>
    </div>
    <form v-if="mode === 'settings'" @submit.prevent="save">
      <p>
        Integração somente leitura. Use um token individual com tickets:read, válido por até 30
        dias. Substituir a credencial limpa o cache da conexão anterior.
      </p>
      <p v-if="!Capacitor.isNativePlatform()">
        No navegador, o token fica apenas na memória desta sessão. Prefira credenciais sintéticas de
        desenvolvimento.
      </p>
      <label
        >URL completa do prefixo público da API<input
          v-model="url"
          type="url"
          required
          placeholder="https://servidor/subdiretorio/api/v1"
          :disabled="iema.busy"
      /></label>
      <label
        >Token pessoal<input
          v-model="token"
          type="password"
          autocomplete="off"
          required
          :disabled="iema.busy"
      /></label>
      <div class="iema-actions">
        <button class="primary" :disabled="iema.busy || iema.blocked">Salvar conexão</button>
        <button
          type="button"
          :disabled="iema.busy || !iema.data.connectionId"
          @click="iema.toggle()"
        >
          {{ iema.data.enabled ? 'Desativar' : 'Ativar' }}
        </button>
        <button type="button" :disabled="iema.busy || !iema.data.enabled" @click="iema.test()">
          Testar conexão
        </button>
        <button type="button" :disabled="iema.busy" @click="iema.disconnect()">
          Desconectar e limpar dados IEMA
        </button>
      </div>
    </form>
    <template v-if="mode === 'tickets'">
      <h3>Meus chamados em atendimento</h3>
      <label>Buscar chamados<input v-model="search" type="search" /></label>
      <div v-if="!tickets.length" class="friendly-empty">
        <strong>{{
          !iema.data.tickets.length
            ? 'Sem chamados sincronizados no momento.'
            : 'Nenhum chamado seu em atendimento com essa busca.'
        }}</strong>
        <p>
          {{
            !iema.data.tickets.length
              ? 'Sua lista aparece quando você conectar e atualizar o IEMA em Configurações.'
              : 'Somente os seus chamados em atendimento aparecem aqui. Ajuste a busca ou sincronize para atualizar.'
          }}
        </p>
      </div>
      <article v-for="ticket in tickets" :key="ticket.key" class="iema-ticket">
        <h3>#{{ ticket.id }} · {{ ticket.title }}</h3>
        <p>
          {{ ticket.status.label }} ·
          {{
            ticket.status.code === 3
              ? 'Concluído'
              : [2, 5, 6].includes(ticket.status.code)
                ? 'Em atendimento / atribuído'
                : 'Outro estado'
          }}
        </p>
        <p>Atualizado: {{ date(ticket.updated_at) }}</p>
        <label
          >Estimativa local (minutos)<input
            type="number"
            min="1"
            max="10080"
            :value="ticket.estimate ?? ''"
            :disabled="iema.busy"
            @change="iema.estimate(ticket, ($event.target as HTMLInputElement).value)"
        /></label>
        <button @click="iema.open(ticket)">Abrir no IEMA</button>
      </article>
    </template>
  </section>
</template>
<style scoped>
.iema-panel {
  padding: 22px;
  border: 1px solid var(--line);
  border-radius: 16px;
  margin: 16px 0;
  background: var(--surface);
  overflow-wrap: anywhere;
}
p {
  margin: 10px 0;
  font-size: 13px;
}
h2 {
  font-size: 20px;
}
h3 {
  font-size: 16px;
}
label {
  display: grid;
  gap: 6px;
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
.iema-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin: 14px 0;
}
button {
  padding: 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
}
button[aria-pressed='true'] {
  font-weight: bold;
  text-decoration: underline;
}
button:disabled {
  opacity: 0.5;
  cursor: wait;
}
.iema-ticket {
  border-top: 1px solid var(--line);
  padding: 18px 0;
}
</style>
