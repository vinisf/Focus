import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import './style.css';
import './habits.css';
import './assistant.css';
import { initializeReviewNotifications } from './services/reviewNotifications';
createApp(App).use(createPinia()).mount('#app');
void initializeReviewNotifications();
