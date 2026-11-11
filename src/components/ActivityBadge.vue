<script setup lang="ts">
import { computed } from 'vue';
import { ListTodo, Leaf, Headset, Plug } from 'lucide-vue-next';
import type { ActivitySource } from '../types/planning';
const props = defineProps<{ source: ActivitySource }>();
const badges = {
  routine: { label: 'Minha rotina', icon: Leaf },
  task: { label: 'Tarefa pessoal', icon: ListTodo },
  habit: { label: 'Hábito', icon: Leaf },
  iema: { label: 'Chamado IEMA', icon: Headset },
  platform: { label: 'Integração', icon: Plug },
};
const badge = computed(() => badges[props.source]);
</script>
<template>
  <span class="activity-badge" :class="'activity-badge-' + source">
    <component :is="badge.icon" :size="13" :stroke-width="1.7" aria-hidden="true" />{{
      badge.label
    }}
  </span>
</template>
