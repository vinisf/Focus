import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import './style.css';
import './habits.css';
import './assistant.css';
import './life-planning.css';
import { initializeReviewNotifications } from './services/reviewNotifications';
import { recoverBackup, RESTORE_JOURNAL } from './services/fullBackup';
let ready = true;
try {
  // Storage denial is handled by each store; pending recovery must finish before mounting.
  let pending: string | null = null;
  try {
    pending = localStorage.getItem(RESTORE_JOURNAL);
  } catch {
    /* Stores report unavailable storage. */
  }
  if (pending !== null) recoverBackup();
} catch {
  ready = false;
  const root = document.getElementById('app');
  if (root) {
    root.setAttribute('role', 'alert');
    root.textContent =
      'Recuperação de backup pendente. Libere espaço no navegador e recarregue. A cópia original foi preservada.';
  }
}
if (ready) {
  createApp(App).use(createPinia()).mount('#app');
  void initializeReviewNotifications();
}
