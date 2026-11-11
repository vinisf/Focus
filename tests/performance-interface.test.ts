// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import PerformanceView from '../src/views/PerformanceView.vue';
import { useTasks } from '../src/stores/tasks';
import { useHabits } from '../src/stores/habits';
import { usePlanning } from '../src/stores/planning';

const now = new Date('2026-10-15T12:00:00');
let wrapper: VueWrapper;
beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(now);
});
afterEach(() => {
  wrapper?.unmount();
  vi.useRealTimers();
});

describe('painel de desempenho', () => {
  it('atualiza os cards por período, separa hábitos e tarefas e apresenta durações longas', async () => {
    const tasks = useTasks();
    tasks.save({
      id: 'done',
      title: 'Entrega',
      description: '',
      categoryId: '0',
      dueDate: '',
      plannedDate: '2026-10-14',
      time: '',
      priority: 'medium',
      importance: 'medium',
      duration: 125,
      status: 'done',
      createdAt: '2026-10-01T12:00:00',
      completedAt: '2026-10-14T12:00:00',
      recurrence: null,
    });
    tasks.save({
      ...tasks.data.tasks[0]!,
      id: 'open',
      status: 'pending',
      completedAt: null,
      plannedDate: '2026-10-15',
    });
    useHabits().save({
      id: 'habit',
      name: 'Ler',
      description: '',
      categoryId: null,
      icon: 'book',
      preferredTime: '',
      status: 'active',
      createdAt: '2026-10-15T08:00:00',
      frequency: { kind: 'daily' },
      plans: [{ from: '2026-10-15', frequency: { kind: 'daily' }, active: true }],
    });
    useHabits().setCompleted('habit', '2026-10-15', true, now);
    wrapper = mount(PerformanceView, { props: { now } });
    expect(wrapper.find('.productivity-summary').text()).toContain('0%');
    expect(wrapper.find('.consistency-summary').text()).toContain('100%');
    expect(wrapper.find('.habits-today').exists()).toBe(false);
    await wrapper.findAll('.performance-switch button')[1]!.trigger('click');
    expect(wrapper.find('.productivity-summary').text()).toContain('50%');
    expect(wrapper.find('.productivity-summary').text()).toContain('1 de 2');
    expect(wrapper.find('.performance-secondary').text()).toContain('2 h 5 min');
    await wrapper.findAll('.performance-switch button')[2]!.trigger('click');
    expect(wrapper.find('.productivity-summary').text()).toContain('50%');
    expect(wrapper.find('button[aria-pressed="true"]').text()).toBe('Mês');
    expect(
      wrapper.find('[role="progressbar"][aria-label="Produtividade"]').attributes('aria-valuenow'),
    ).toBe('50');
    await wrapper.find('select[aria-label="Escala da evolução"]').setValue('months');
    expect(wrapper.findAll('tbody tr')).toHaveLength(12);
    expect(wrapper.find('tbody tr').text()).toContain('Sem dados');
    expect(wrapper.findAll('.performance-chart circle').length).toBeGreaterThan(0);
  });
  it('mostra ausência de dados sem desenhar resultados artificiais', () => {
    wrapper = mount(PerformanceView, { props: { now } });
    expect(wrapper.findAll('.performance-value').map((value) => value.text())).toEqual(['—', '—']);
    expect(wrapper.findAll('[role="progressbar"]')).toHaveLength(0);
    expect(wrapper.find('.performance-chart').exists()).toBe(false);
    expect(wrapper.find('.performance-empty').text()).toContain('Ainda não há');
  });
  it('não infla tempo confirmado com sessão aberta e permite encerrá-la', async () => {
    const planning = usePlanning();
    planning.start('task:one', 'task', new Date('2026-10-15T10:00:00'));
    wrapper = mount(PerformanceView, { props: { now } });
    expect(wrapper.findAll('.performance-secondary strong')[2]!.text()).toBe('—');
    expect(wrapper.find('.performance-note').text()).toContain('sessão aberta');
    expect(wrapper.find('.performance-session-stop').exists()).toBe(true);
    await wrapper.find('.performance-session-stop').trigger('click');
    expect(wrapper.findAll('.performance-secondary strong')[2]!.text()).toBe('2 h');
    expect(planning.running).toBeUndefined();
  });
});
