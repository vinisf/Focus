<script setup lang="ts">
import { Leaf, Dumbbell, BookOpen, Droplets, Heart, Sun } from 'lucide-vue-next';
import type { HabitIcon } from '../types/habits';
withDefaults(defineProps<{ name: HabitIcon; size?: number }>(), { size: 19 });
const icons = {
  leaf: Leaf,
  dumbbell: Dumbbell,
  book: BookOpen,
  droplets: Droplets,
  heart: Heart,
  sun: Sun,
};
</script>
<template><component :is="icons[name]" :size="size" aria-hidden="true" /></template>
