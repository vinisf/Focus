// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { recommendActivities } from '../src/utils/recommendations';
import type { RecommendationContext } from '../src/types/recommendations';
import type { Habit, HabitFrequency } from '../src/types/habits';
import type { Task } from '../src/types';
import { useHabits } from '../src/stores/habits';
import ActivitySuggestions from '../src/components/ActivitySuggestions.vue';
import { LocalHabitRepository } from '../src/services/habitRepository';
const now = new Date('2026-10-14T12:00:00');
const habit = (frequency: HabitFrequency = { kind: 'daily' }, id = 'h'): Habit => ({
  id,
  name: id,
  description: '',
  categoryId: null,
  icon: 'leaf',
  frequency,
  preferredTime: '',
  createdAt: '2026-10-12T12:00:00',
  status: 'active',
  plans: [{ from: '2026-10-12', active: true, frequency }],
});
const task = (overrides: Partial<Task> = {}): Task => ({
  id: 't',
  title: 'Entrega',
  description: '',
  categoryId: 'c',
  dueDate: '',
  plannedDate: '',
  time: '',
  priority: 'low',
  importance: 'low',
  duration: 20,
  status: 'pending',
  createdAt: '2026-10-12T12:00:00',
  completedAt: null,
  recurrence: null,
  ...overrides,
});
const context = (overrides: Partial<RecommendationContext> = {}): RecommendationContext => ({
  tasks: [],
  habits: [habit()],
  completions: [],
  minutes: 30,
  now,
  ...overrides,
});
const completion = (habitId = 'h', date = '2026-10-14', completedAt = '2026-10-14T11:00:00') => ({
  id: habitId + date,
  habitId,
  date,
  completedAt,
});
beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
});
describe('recomendações de atividades', () => {
  it('recomenda hábitos sem tarefas e com todas as tarefas concluídas', () => {
    expect(recommendActivities(context()).activities[0]?.type).toBe('habit');
    expect(
      recommendActivities(context({ tasks: [task({ status: 'done' })] })).activities[0]?.type,
    ).toBe('habit');
  });
  it('no Meu Dia oferece habitos pelo horario ou ao terminar as tarefas do dia', () => {
    const scheduled = { ...habit(), preferredTime: '12:00' };
    const daily = context({
      habitsWhenTimelyOrTasksDone: true,
      tasks: [task()],
      habits: [scheduled],
    });
    expect(recommendActivities(daily).activities[0]?.type).toBe('habit');
    expect(
      recommendActivities({ ...daily, now: new Date('2026-10-14T09:00:00') }).activities.some(
        (a) => a.type === 'habit',
      ),
    ).toBe(false);
    expect(
      recommendActivities({
        ...daily,
        now: new Date('2026-10-14T09:00:00'),
        tasks: [task({ status: 'done' })],
      }).activities[0]?.type,
    ).toBe('habit');
    expect(
      recommendActivities({ ...daily, habits: [habit()] }).activities.some(
        (a) => a.type === 'habit',
      ),
    ).toBe(false);
    expect(
      recommendActivities({ ...daily, tasks: [task({ plannedDate: '2026-10-15' })] }).activities[0]
        ?.type,
    ).toBe('habit');
    expect(
      recommendActivities({ ...daily, completions: [completion()] }).activities.some(
        (a) => a.type === 'habit',
      ),
    ).toBe(false);
  });
  it('mostra e conclui um habito no card compacto sem tarefas pendentes', async () => {
    useHabits().save(habit(), now);
    const wrapper = mount(ActivitySuggestions, { props: { now, minutes: 30, compact: true } });
    expect(wrapper.find('.activity-badge').text()).toBe('Hábito');
    await wrapper.find('.suggestion-actions .primary').trigger('click');
    expect(useHabits().data.completions).toHaveLength(1);
    expect(wrapper.find('.suggestion-actions .primary').exists()).toBe(false);
    wrapper.unmount();
  });
  it('descansa quando a meta diária ou semanal está satisfeita', () => {
    expect(recommendActivities(context({ completions: [completion()] })).activities).toEqual([]);
    expect(
      recommendActivities(
        context({
          habits: [habit({ kind: 'weekly', target: 1 })],
          completions: [completion('h', '2026-10-12')],
        }),
      ).activities,
    ).toEqual([]);
  });
  it('distribui metas flexíveis ao longo da semana sem esperar domingo', () => {
    const habits = [habit({ kind: 'weekly', target: 3 })];
    const completions = [completion('h', '2026-10-12')];
    expect(
      recommendActivities(context({ habits, completions, now: new Date('2026-10-13T12:00:00') }))
        .activities,
    ).toEqual([]);
    expect(recommendActivities(context({ habits, completions })).activities[0]?.reason).toContain(
      'Faltam 2',
    );
  });
  it('respeita dias fixos, arquivo e planejamento futuro', () => {
    expect(
      recommendActivities(context({ habits: [habit({ kind: 'weekdays', days: [1] })] })).activities,
    ).toEqual([]);
    expect(
      recommendActivities(
        context({
          habits: [{ ...habit(), status: 'archived' }],
          tasks: [task({ plannedDate: '2026-10-15' })],
        }),
      ).activities,
    ).toEqual([]);
  });
  it('elimina atividades que não cabem e informa duração desconhecida', () => {
    expect(
      recommendActivities(
        context({ habits: [{ ...habit(), duration: 60 }], tasks: [task({ duration: 60 })] }),
      ).activities,
    ).toEqual([]);
    expect(recommendActivities(context()).activities[0]?.duration).toBeNull();
  });
  it('respeita intervalo próprio e conflitos intensos sem bloquear esforço leve', () => {
    const heavy = {
      ...habit({ kind: 'daily' }, 'heavy'),
      intensity: 'high' as const,
      effort: 'physical' as const,
      minIntervalHours: 24,
    };
    const run = { ...heavy, id: 'run', name: 'run' };
    const ctx = context({ habits: [heavy, run], completions: [completion('heavy')] });
    expect(recommendActivities(ctx).activities).toEqual([]);
    expect(
      recommendActivities({ ...ctx, habits: [heavy, { ...run, intensity: 'light' }] }).activities[0]
        ?.key,
    ).toBe('habit:run');
    expect(
      recommendActivities({ ...ctx, now: new Date('2026-10-15T12:00:00') }).activities.length,
    ).toBe(2);
  });
  it('prioriza tarefa importante próxima do prazo e hábito sobre tarefa de baixa importância', () => {
    expect(recommendActivities(context({ tasks: [task()] })).activities[0]?.type).toBe('habit');
    expect(
      recommendActivities(context({ tasks: [task({ importance: 'high', dueDate: '2026-10-15' })] }))
        .activities[0]?.type,
    ).toBe('task');
  });
  it('aplica filtros, desempate determinístico, limite e adiamento com expiração', () => {
    const ctx = context({
      habits: ['e', 'd', 'c', 'b', 'a'].map((id) => habit({ kind: 'daily' }, id)),
      tasks: [task()],
    });
    expect(recommendActivities(ctx).activities.map((a) => a.key)).toEqual([
      'habit:a',
      'habit:b',
      'habit:c',
      'habit:d',
    ]);
    expect(recommendActivities({ ...ctx, filter: 'task' }).activities[0]?.type).toBe('task');
    const deferred = [{ key: 'habit:h', until: now.getTime() + 3600000 }];
    expect(recommendActivities(context({ deferred })).activities).toEqual([]);
    expect(
      recommendActivities(context({ deferred, now: new Date(now.getTime() + 3600000) })).activities,
    ).toHaveLength(1);
  });
  it('registra sessões parciais e persiste sem duplicar o dia na consistência', () => {
    const store = useHabits();
    const h = habit();
    h.goal = { kind: 'quantity', target: 3, unit: 'capítulos', description: '' };
    h.plans[0]!.goal = h.goal;
    h.allowMultipleSessions = true;
    expect(store.save(h, now)).toBe(true);
    expect(store.recordSession('h', 1, now)).toBe(true);
    expect(store.data.completions).toHaveLength(0);
    expect(store.recordSession('h', 2, now)).toBe(true);
    expect(store.data.completions).toHaveLength(1);
    expect(store.recordSession('h', 1, now)).toBe(false);
    expect(new LocalHabitRepository().load()?.sessions).toHaveLength(2);
  });
  it('pula pelo cartão sem alterar o hábito e volta ao remontar', async () => {
    useHabits().save(habit(), now);
    let wrapper = mount(ActivitySuggestions, { props: { now, minutes: 30 } });
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Agora não')!
      .trigger('click');
    expect(wrapper.find('.round-notice').text()).toContain('Você já percorreu');
    expect(useHabits().data.completions).toHaveLength(0);
    wrapper.unmount();
    wrapper = mount(ActivitySuggestions, { props: { now, minutes: 30 } });
    expect(wrapper.find('.empty-recommend').exists()).toBe(false);
    await wrapper.find('.suggestion-actions .primary').trigger('click');
    expect(useHabits().data.completions).toHaveLength(1);
    wrapper.unmount();
  });
});
