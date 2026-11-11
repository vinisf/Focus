import { ref } from 'vue';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { LocalNotificationsPlugin } from '@capacitor/local-notifications';
import { useAssistant, validTime } from '../stores/assistant';

export const REVIEW_NOTIFICATION_ID = 204020;
export const reviewRequested = ref(false);
export function openReviewFromNotification(id: number) {
  if (id === REVIEW_NOTIFICATION_ID) reviewRequested.value = true;
}
type NotificationPort = Pick<
  LocalNotificationsPlugin,
  'checkPermissions' | 'requestPermissions' | 'getPending' | 'cancel' | 'schedule' | 'createChannel'
>;
export class ReviewNotifications {
  private pending: Promise<unknown> = Promise.resolve();
  constructor(
    private port: NotificationPort,
    readonly native: boolean,
  ) {}
  sync(preference: { enabled: boolean; time: string }, requestPermission = false): Promise<void> {
    const operation = this.pending
      .catch(() => {})
      .then(() => this.apply(preference, requestPermission));
    this.pending = operation;
    return operation;
  }
  private async apply(preference: { enabled: boolean; time: string }, request: boolean) {
    if (!validTime(preference.time)) throw new Error('Escolha um horário válido.');
    if (!this.native) {
      if (preference.enabled)
        throw new Error('O lembrete local está disponível no aplicativo Android.');
      return;
    }
    if (!preference.enabled) {
      await this.port.cancel({ notifications: [{ id: REVIEW_NOTIFICATION_ID }] });
      return;
    }
    let permission = await this.port.checkPermissions();
    if (permission.display !== 'granted' && request)
      permission = await this.port.requestPermissions();
    if (permission.display !== 'granted')
      throw new Error(
        'Permita as notificações do Focus nas configurações do Android para receber o lembrete.',
      );
    const [hour, minute] = preference.time.split(':').map(Number);
    const existing = (await this.port.getPending()).notifications.find(
      (n) => n.id === REVIEW_NOTIFICATION_ID,
    );
    if (
      existing?.schedule?.on?.hour === hour &&
      existing.schedule.on.minute === minute &&
      existing.schedule.repeats
    )
      return;
    await this.port.createChannel({
      id: 'tomorrow-review',
      name: 'Revisão de amanhã',
      importance: 3,
      description: 'Um lembrete diário para planejar com calma.',
    });
    await this.port.cancel({ notifications: [{ id: REVIEW_NOTIFICATION_ID }] });
    await this.port.schedule({
      notifications: [
        {
          id: REVIEW_NOTIFICATION_ID,
          title: 'Vamos preparar o amanhã?',
          body: 'Reserve alguns minutos para revisar suas tarefas e organizar o próximo dia.',
          channelId: 'tomorrow-review',
          smallIcon: 'ic_stat_focus',
          schedule: { on: { hour, minute }, repeats: true, allowWhileIdle: true },
          extra: { screen: 'plan-tomorrow' },
        },
      ],
    });
  }
}
export const reviewNotifications = new ReviewNotifications(
  LocalNotifications,
  Capacitor.isNativePlatform(),
);
export async function initializeReviewNotifications() {
  if (!Capacitor.isNativePlatform()) return;
  const assistant = useAssistant();
  try {
    await LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
      openReviewFromNotification(action.notification.id);
    });
    const reconcile = async () => {
      if (assistant.blocked) return;
      try {
        await reviewNotifications.sync(assistant.data.notification);
      } catch (e) {
        assistant.error =
          e instanceof Error ? e.message : 'Não foi possível conferir o lembrete local.';
      }
    };
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) void reconcile();
    });
    await reconcile();
  } catch {
    assistant.error = 'O lembrete local não pôde ser iniciado neste dispositivo.';
  }
}
