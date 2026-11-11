<script setup lang="ts">
import { ref } from 'vue';
defineProps<{ label: string; description: string; disabled?: boolean }>();
const emit = defineEmits<{ confirm: [] }>();
const confirming = ref(false);
</script>
<template>
  <div class="delete-activity">
    <button
      type="button"
      class="delete-button"
      :disabled="disabled"
      :aria-expanded="confirming"
      @click="confirming = !confirming"
    >
      {{ label }}
    </button>
    <div
      v-if="confirming"
      class="delete-confirmation"
      role="group"
      :aria-label="'Confirmar ' + label.toLocaleLowerCase()"
    >
      <p>{{ description }} Esta ação não pode ser desfeita.</p>
      <div class="delete-actions">
        <button type="button" @click="confirming = false">Voltar</button>
        <button type="button" class="delete-button" :disabled="disabled" @click="emit('confirm')">
          Confirmar exclusão
        </button>
      </div>
    </div>
  </div>
</template>
<style scoped>
.delete-activity {
  margin-top: 18px;
}
.delete-button {
  color: #bc3d50;
  padding: 9px 12px;
  border: 1px solid currentColor;
  border-radius: 8px;
}
.delete-confirmation {
  margin-top: 10px;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
}
.delete-confirmation p {
  font-size: 13px;
  line-height: 1.6;
}
.delete-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 12px;
}
</style>
