<script setup lang="ts">
import { ref } from 'vue';
import { useAssistant } from '../stores/assistant';
import { reviewNotifications } from '../services/reviewNotifications';
const assistant = useAssistant();
const time = ref(assistant.data.notification.time);
const busy = ref(false),
  message = ref('');
async function updateNotification(enabled: boolean) {
  busy.value = true;
  message.value = '';
  const previous = { ...assistant.data.notification };
  try {
    const next = { enabled, time: time.value };
    await reviewNotifications.sync(next, enabled);
    if (!assistant.save({ notification: next })) {
      await reviewNotifications.sync(previous);
      message.value = assistant.error;
    } else message.value = enabled ? 'Lembrete diário programado.' : 'Lembrete desativado.';
  } catch (error) {
    message.value =
      error instanceof Error ? error.message : 'Não foi possível programar o lembrete.';
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <div class="assistant-settings">
    <h3>Revisão de amanhã</h3>
    <p>Um lembrete local para organizar o próximo dia. Você decide se quer receber.</p>
    <label class="planning-check"
      ><input
        type="checkbox"
        :checked="assistant.data.notification.enabled"
        :disabled="busy || assistant.blocked"
        @change="updateNotification(($event.target as HTMLInputElement).checked)"
      />Lembrar todas as noites</label
    >
    <label
      >Horário do lembrete<input
        v-model="time"
        type="time"
        :disabled="busy"
        @change="updateNotification(assistant.data.notification.enabled)"
    /></label>
    <p class="muted">
      No Android, a entrega pode atrasar conforme a economia de bateria. Nenhum dado das suas
      atividades vai na notificação.
    </p>
    <h3>Horários e prioridades</h3>
    <label
      >Antecedência de compromisso obrigatório (min)<input
        type="number"
        min="0"
        max="120"
        :value="assistant.data.imminentMinutes"
        @change="
          assistant.save({ imminentMinutes: Number(($event.target as HTMLInputElement).value) })
        "
    /></label>
    <label
      >Janela do horário preferencial de hábitos (min)<input
        type="number"
        min="0"
        max="240"
        :value="assistant.data.habitWindowMinutes"
        @change="
          assistant.save({ habitWindowMinutes: Number(($event.target as HTMLInputElement).value) })
        "
    /></label>
    <div class="plan-controls">
      <label
        >Descanso começa às<input
          type="time"
          :value="assistant.data.restStart"
          @change="assistant.save({ restStart: ($event.target as HTMLInputElement).value })"
      /></label>
      <label
        >Termina às<input
          type="time"
          :value="assistant.data.restEnd"
          @change="assistant.save({ restEnd: ($event.target as HTMLInputElement).value })"
      /></label>
      <button class="text-button" @click="assistant.save({ restStart: '', restEnd: '' })">
        Limpar descanso
      </button>
    </div>
    <p v-if="message || assistant.error" role="status">{{ message || assistant.error }}</p>
  </div>
</template>
