import { ref, onUnmounted } from 'vue';
export function useClock() {
  const now = ref(new Date());
  const timer = setInterval(() => {
    now.value = new Date();
  }, 30000);
  onUnmounted(() => clearInterval(timer));
  return now;
}
