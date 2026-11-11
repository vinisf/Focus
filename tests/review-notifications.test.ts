// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ReviewNotifications,
  REVIEW_NOTIFICATION_ID,
  openReviewFromNotification,
  reviewRequested,
} from '../src/services/reviewNotifications';
import { mount } from '@vue/test-utils';
import FocusView from '../src/views/FocusView.vue';
import type {
  PendingLocalNotificationSchema,
  ScheduleOptions,
} from '@capacitor/local-notifications';
import { createPinia, setActivePinia } from 'pinia';
import { useAssistant } from '../src/stores/assistant';
function fixture() {
  let pending: PendingLocalNotificationSchema[] = [];
  const port = {
    checkPermissions: vi.fn(async () => ({ display: 'granted' as const })),
    requestPermissions: vi.fn(async () => ({ display: 'granted' as const })),
    getPending: vi.fn(async () => ({ notifications: pending })),
    cancel: vi.fn(async () => {
      pending = [];
    }),
    schedule: vi.fn(async (options: ScheduleOptions) => {
      pending = options.notifications;
      return { notifications: options.notifications.map((n) => ({ id: n.id })) };
    }),
    createChannel: vi.fn(async () => {}),
  };
  return { port, service: new ReviewNotifications(port, true) };
}
beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
});
describe('lembrete local de revisão', () => {
  it('abre diretamente Planejar amanhã ao tocar no lembrete', () => {
    reviewRequested.value = false;
    openReviewFromNotification(12);
    expect(reviewRequested.value).toBe(false);
    openReviewFromNotification(REVIEW_NOTIFICATION_ID);
    const wrapper = mount(FocusView);
    expect(wrapper.find('h1').text()).toBe('Planejar amanhã');
    expect(wrapper.find('.tomorrow-plan').exists()).toBe(true);
    expect(wrapper.find('.task-section').exists()).toBe(false);
    expect(reviewRequested.value).toBe(false);
    wrapper.unmount();
  });
  it('programa um único lembrete diário às 20h sem conteúdo sensível', async () => {
    const { port, service } = fixture();
    await service.sync({ enabled: true, time: '20:00' });
    const notifications = port.schedule.mock.calls[0]![0].notifications;
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
      id: REVIEW_NOTIFICATION_ID,
      extra: { screen: 'plan-tomorrow' },
      schedule: { on: { hour: 20, minute: 0 }, repeats: true, allowWhileIdle: true },
    });
    expect(JSON.stringify(notifications)).not.toContain('iema');
    expect(notifications[0]!.title).toBe('Vamos preparar o amanhã?');
    expect(port.requestPermissions).not.toHaveBeenCalled();
  });
  it('não duplica ao reconciliar repetidamente ou concorrentemente', async () => {
    const { port, service } = fixture();
    await Promise.all(
      Array.from({ length: 5 }, () => service.sync({ enabled: true, time: '20:00' })),
    );
    expect(port.schedule).toHaveBeenCalledTimes(1);
  });
  it('altera o horário usando a mesma identidade e cancela o anterior', async () => {
    const { port, service } = fixture();
    await service.sync({ enabled: true, time: '20:00' });
    await service.sync({ enabled: true, time: '21:15' });
    expect(port.schedule).toHaveBeenCalledTimes(2);
    expect((await port.getPending()).notifications).toHaveLength(1);
    expect((await port.getPending()).notifications[0]).toMatchObject({
      id: REVIEW_NOTIFICATION_ID,
      schedule: { on: { hour: 21, minute: 15 } },
    });
  });
  it('desativa e remove o agendamento sem pedir permissão', async () => {
    const { port, service } = fixture();
    await service.sync({ enabled: true, time: '20:00' });
    await service.sync({ enabled: false, time: '20:00' });
    expect((await port.getPending()).notifications).toHaveLength(0);
    expect(port.requestPermissions).not.toHaveBeenCalled();
  });
  it('solicita permissão somente após ativação explícita e trata recusa', async () => {
    const { port, service } = fixture();
    port.checkPermissions.mockResolvedValue({ display: 'denied' as never });
    await expect(service.sync({ enabled: true, time: '20:00' })).rejects.toThrow(
      'Permita as notificações',
    );
    expect(port.requestPermissions).not.toHaveBeenCalled();
    await service.sync({ enabled: true, time: '20:00' }, true);
    expect(port.requestPermissions).toHaveBeenCalledOnce();
    port.requestPermissions.mockResolvedValue({ display: 'denied' as never });
    await expect(service.sync({ enabled: true, time: '21:00' }, true)).rejects.toThrow(
      'Permita as notificações',
    );
  });
  it('restaura a configuração após reabrir sem criar outro agendamento', async () => {
    const { port, service } = fixture();
    useAssistant().save({ notification: { enabled: true, time: '19:30' } });
    await service.sync(useAssistant().data.notification);
    setActivePinia(createPinia());
    await new ReviewNotifications(port, true).sync(useAssistant().data.notification);
    expect(port.schedule).toHaveBeenCalledTimes(1);
    // Native boot receiver restores these saved repeating schedules without the WebView.
    expect(useAssistant().data.notification.time).toBe('19:30');
  });
  it('recria agendamento perdido e não depende de rede', async () => {
    const { port, service } = fixture();
    await service.sync({ enabled: true, time: '20:00' });
    await port.cancel();
    await service.sync({ enabled: true, time: '20:00' });
    expect(port.schedule).toHaveBeenCalledTimes(2);
  });
  it('no navegador não promete notificações nativas', async () => {
    const { port } = fixture();
    const service = new ReviewNotifications(port, false);
    await expect(service.sync({ enabled: true, time: '20:00' }, true)).rejects.toThrow('Android');
    expect(port.schedule).not.toHaveBeenCalled();
  });
});
