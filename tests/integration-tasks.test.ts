// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { useTasks } from '../src/stores/tasks';
import { usePlanning } from '../src/stores/planning';
import { LocalRepository } from '../src/services/repository';
import { integrationTasksForDay } from '../src/utils/integrationTasks';
import { recommendActivities } from '../src/utils/recommendations';
import type { ImportRow } from '../src/services/integrations/excel/import';
import { emptyPlatform } from '../src/services/integrations/excel/import';
import ActivitySuggestions from '../src/components/ActivitySuggestions.vue';
import TaskRow from '../src/components/TaskRow.vue';
import FocusView from '../src/views/FocusView.vue';
import { dateKey } from '../src/utils/dates';

const now = new Date('2026-10-22T12:00:00');
const tomorrow = new Date('2026-10-23T12:00:00');
const rows = (count = 5): ImportRow[] =>
  Array.from({ length: count }, (_, i) => ({
    row: i + 2,
    name: `Plataforma ${i}`,
    color: 'none',
    status: 'pending',
    included: true,
    suggestedDiscontinued: false,
    resolution: '',
    targetKey: '',
  }));
beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  setActivePinia(createPinia());
});
const recommendations = (minutes = 30, filter: 'all' | 'task' | 'platform' = 'all') => {
  const store = useTasks();
  return recommendActivities({
    tasks: store.data.tasks,
    habits: [],
    completions: [],
    now,
    minutes,
    filter,
    integrationDailyLimit: store.data.integrationDailyLimit,
  });
};

describe('planilha como tarefas opcionais de integração', () => {
  it('cria apenas pendentes com 30 minutos, sem prazo nem planejamento obrigatório', () => {
    const store = useTasks();
    const source = [
      ...rows(2),
      { ...rows(1)[0]!, name: 'Concluída', status: 'done' as const },
      { ...rows(1)[0]!, name: 'Desconhecida', status: 'unknown' as const },
    ];
    expect(store.importIntegrations(source, now)).toBe(2);
    expect(store.data.tasks).toHaveLength(2);
    expect(store.data.tasks[0]).toMatchObject({
      title: 'Integrar Plataforma 0',
      integrationName: 'Plataforma 0',
      status: 'pending',
      duration: 30,
      dueDate: '',
      plannedDate: '',
      recurrence: null,
    });
    expect(new LocalRepository().load()?.tasks).toEqual(store.data.tasks);
    expect(store.data.categories.find((c) => c.id === store.data.tasks[0]?.categoryId)?.name).toBe(
      'Integrações',
    );
  });
  it('deduplica arquivo e reimportação por nome, preservando conclusão, notas e adiamento', () => {
    const store = useTasks();
    store.importIntegrations(rows(2), now);
    const [done, postponed] = store.data.tasks;
    store.save({
      ...done!,
      status: 'done',
      completedAt: now.toISOString(),
      duration: 45,
      description: 'Minhas notas',
    });
    store.postponeIntegration(postponed!, now);
    const snapshot = JSON.stringify(store.data.tasks);
    expect(
      store.importIntegrations([...rows(2), { ...rows(1)[0]!, name: '01. PLATAFORMA 0' }], now),
    ).toBe(0);
    expect(JSON.stringify(store.data.tasks)).toBe(snapshot);
  });
  it('persiste a preferência de uma ou duas por dia e limita as sugestões', () => {
    const store = useTasks();
    store.importIntegrations(rows(), now);
    expect(integrationTasksForDay(store.data.tasks, now)).toHaveLength(2);
    expect(recommendations().activities).toHaveLength(2);
    store.integrationLimit(1);
    expect(recommendations().activities).toHaveLength(1);
    setActivePinia(createPinia());
    expect(useTasks().data.integrationDailyLimit).toBe(1);
  });
  it('conclusões consomem a cota e não sugerem a lista inteira em sequência', () => {
    const store = useTasks();
    store.importIntegrations(rows(10), now);
    const [a, b] = store.data.tasks;
    store.save({ ...a!, status: 'done', completedAt: now.toISOString() });
    expect(recommendations().activities).toHaveLength(1);
    store.save({ ...b!, status: 'done', completedAt: now.toISOString() });
    expect(recommendations().activities).toEqual([]);
    expect(integrationTasksForDay(store.data.tasks, tomorrow)).toHaveLength(2);
  });
  it('adiar conta como escolha do dia, persiste e libera a tarefa amanhã sem inventar prazo', () => {
    const store = useTasks();
    store.importIntegrations(rows(5), now);
    for (const task of store.data.tasks.slice(0, 2))
      expect(store.postponeIntegration(task, now)).toBe(true);
    expect(recommendations().activities).toEqual([]);
    expect(store.data.tasks[0]).toMatchObject({
      plannedDate: '2026-10-23',
      dueDate: '',
      status: 'pending',
      integrationDeferredOn: '2026-10-22',
    });
    setActivePinia(createPinia());
    expect(integrationTasksForDay(useTasks().data.tasks, now)).toEqual([]);
    expect(integrationTasksForDay(useTasks().data.tasks, tomorrow)).toHaveLength(2);
  });
  it('respeita o tempo disponível e os filtros sem duplicar recomendações legadas', () => {
    const store = useTasks();
    store.importIntegrations(rows(1), now);
    expect(recommendations(20).activities).toEqual([]);
    expect(recommendations(30, 'task').activities).toEqual([]);
    expect(recommendations(30, 'platform').activities[0]?.type).toBe('task');
    const platform = { ...emptyPlatform('Plataforma 0'), nextAction: 'Testar', estimate: 30 };
    const context = {
      tasks: store.data.tasks,
      habits: [],
      completions: [],
      now,
      minutes: 30,
      platforms: [platform],
    };
    expect(recommendActivities(context).activities).toHaveLength(1);
    const preferences = usePlanning().data.preferences;
    expect(
      recommendActivities({
        ...context,
        preferences: { ...preferences, excludedSources: ['platform'] },
      }).activities,
    ).toEqual([]);
    expect(
      recommendActivities({ ...context, preferences: { ...preferences, maxWorkMinutes: 20 } })
        .activities,
    ).toEqual([]);
  });
  it('falha de gravação não adiciona tarefas ou categorias parcialmente', () => {
    const store = useTasks();
    const snapshot = JSON.stringify(store.data);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(store.importIntegrations(rows(), now)).toBeNull();
    expect(JSON.stringify(store.data)).toBe(snapshot);
  });
  it('não importa informações fora da lista de campos permitidos', () => {
    const store = useTasks();
    const source = [
      { ...rows(1)[0]!, login: 'secret-login', password: 'secret-password', notes: 'secret-note' },
    ];
    store.importIntegrations(source, now);
    const saved = localStorage.getItem('focus.v1')!;
    for (const secret of ['secret-login', 'secret-password', 'secret-note'])
      expect(saved).not.toContain(secret);
    expect(store.data.tasks[0]).not.toHaveProperty('row');
  });
  it('apaga somente tarefas de integração e permite importar novamente', () => {
    const store = useTasks();
    store.importIntegrations(rows(1), now);
    store.save({
      ...store.data.tasks[0]!,
      id: 'personal',
      integrationName: undefined,
      title: 'Pessoal',
    });
    expect(store.clearIntegrations()).toBe(true);
    expect(store.data.tasks.map((t) => t.title)).toEqual(['Pessoal']);
    expect(store.importIntegrations(rows(1), now)).toBe(1);
  });
  it('encerra a sessão da tarefa antes de adiá-la', () => {
    const store = useTasks();
    store.importIntegrations(rows(1), now);
    const task = store.data.tasks[0]!;
    const planning = usePlanning();
    planning.start(`task:${task.id}`, 'task', now, 30);
    expect(store.clearIntegrations()).toBe(false);
    expect(store.postponeIntegration(task, now)).toBe(true);
    expect(planning.running).toBeUndefined();
  });
  it('pula sem adiar no cartão de recomendações', async () => {
    const store = useTasks();
    store.importIntegrations(rows(1), now);
    const wrapper = mount(ActivitySuggestions, { props: { now, minutes: 30 } });
    expect(wrapper.text()).toContain('Integrar Plataforma 0');
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Agora não')!
      .trigger('click');
    expect(store.data.tasks[0]?.plannedDate).toBe('');
    expect(wrapper.find('.round-notice').text()).toContain('Você já percorreu');
    wrapper.unmount();
  });
  it('recomenda integrações em Meu Dia e mostra todas na lista completa', async () => {
    const store = useTasks();
    store.importIntegrations(rows(8));
    const wrapper = mount(FocusView);
    expect(wrapper.findAllComponents(TaskRow)).toHaveLength(0);
    expect(wrapper.find('.suggested-task').exists()).toBe(true);
    await wrapper
      .findAll('button')
      .find((b) => b.text().startsWith('Tarefas'))!
      .trigger('click');
    expect(wrapper.findAllComponents(TaskRow)).toHaveLength(8);
    expect(wrapper.findAllComponents(TaskRow)[0]?.text()).toContain('Adiar para amanhã');
    expect(store.data.tasks.every((t) => !t.dueDate && !t.plannedDate)).toBe(true);
    expect(dateKey(new Date())).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    wrapper.unmount();
  });
});
