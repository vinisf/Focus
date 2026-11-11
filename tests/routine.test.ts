// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { defaultRoutine, ROUTINE_KEY, useRoutine } from '../src/stores/routine';
import { useFocusExecution } from '../src/stores/focusExecution';
import { useTasks } from '../src/stores/tasks';
import { useHabits } from '../src/stores/habits';
import { useRecommendationContext } from '../src/composables/useRecommendationContext';
import { recommendationEngine as engine } from '../src/services/RecommendationEngine';
import { planDay } from '../src/utils/dayPlanner';
import ActivitySuggestions from '../src/components/ActivitySuggestions.vue';
import RoutineSettings from '../src/components/RoutineSettings.vue';
import type { RecommendationContext } from '../src/types/recommendations';
import type { Task } from '../src/types';
const now = new Date('2026-10-27T12:45:00');
const task = (id: string, extra: Partial<Task> = {}): Task => ({
  id,
  title: id,
  description: '',
  categoryId: '0',
  dueDate: '',
  plannedDate: '',
  time: '',
  priority: 'medium',
  importance: 'medium',
  duration: 20,
  status: 'pending',
  createdAt: now.toISOString(),
  completedAt: null,
  recurrence: null,
  ...extra,
});
function context(extra: Partial<RecommendationContext> = {}): RecommendationContext {
  return {
    now,
    minutes: 60,
    tasks: [],
    habits: [],
    completions: [],
    routine: {
      version: 1,
      preferences: { ...defaultRoutine(), enabled: true },
      exceptions: [],
      states: [],
      timer: false,
    },
    ...extra,
  };
}
beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
});
describe('rotina independente no motor existente', () => {
  it('sugere almoço com linguagem condicional e janela', () => {
    const a = engine.recommend(context()).activities[0]!;
    expect(a.key).toBe('routine:lunch');
    expect(a.reason).toContain('Se ainda fizer sentido');
    expect(a.reason).toContain('12:30');
  });
  it('continua funcionando sem configurar rotina', () => {
    expect(
      engine.recommend(context({ routine: undefined, tasks: [task('t')] })).activities[0]!.key,
    ).toBe('task:t');
    expect(
      engine.recommend(
        context({ routine: { ...context().routine!, preferences: defaultRoutine() } }),
      ).activities,
    ).toEqual([]);
  });
  it('aplica janela temporária somente na data escolhida', () => {
    const c = context();
    c.routine!.exceptions.push({
      date: '2026-10-27',
      windows: [{ id: 'lunch', title: 'Almoçar', start: '14:00', end: '15:00' }],
      unavailable: [],
    });
    expect(engine.recommend(c).activities).toEqual([]);
    expect(
      engine.recommend({ ...c, now: new Date('2026-10-28T12:45:00') }).activities[0]!.key,
    ).toBe('routine:lunch');
  });
  it('não sugere refeição já realizada e não mistura dias', () => {
    const c = context();
    c.routine!.states.push({ id: 'lunch', date: '2026-10-27', done: true, until: 0 });
    expect(engine.recommend(c).activities.map((a) => a.key)).toEqual(['routine:breakfast']);
    expect(
      engine.recommend({ ...c, now: new Date('2026-10-28T12:45:00') }).activities,
    ).toHaveLength(2);
  });
  it('mantém tarefa urgente e compromisso obrigatório acima da refeição', () => {
    for (const t of [
      task('urgente', { priority: 'urgent' }),
      task('prazo', { dueDate: '2026-10-27' }),
      task('reunião', { mandatory: true, plannedDate: '2026-10-27', scheduledTime: '12:50' }),
    ]) {
      expect(engine.recommend(context({ tasks: [t] })).activities[0]!.key).toBe(`task:${t.id}`);
    }
  });
  it('pular não altera tarefa e reinicia a rodada', () => {
    const c = context({ routine: undefined, tasks: [task('a'), task('b')] });
    const original = JSON.stringify(c.tasks);
    const first = engine.recommend(c);
    const next = engine.skip(first.activities[0]!, c, first.round);
    expect(next.activities[0]!.key).not.toBe(first.activities[0]!.key);
    const reset = engine.skip(next.activities[0]!, c, next.round);
    expect(reset.restarted).toBe(true);
    expect(JSON.stringify(c.tasks)).toBe(original);
  });
  it('traz atividade pulada de volta ao se tornar urgente', () => {
    const c = context({ routine: undefined, tasks: [task('a'), task('b')] });
    const first = engine.recommend(c);
    const next = engine.skip(first.activities[0]!, c, first.round);
    c.tasks.find((t) => `task:${t.id}` === first.activities[0]!.key)!.priority = 'urgent';
    expect(engine.recommend(c, next.round).activities[0]!.key).toBe(first.activities[0]!.key);
  });
  it('suprime rotina por 30 minutos mesmo com reinício da rodada', () => {
    const c = context();
    c.routine!.states.push({
      id: 'lunch',
      date: '2026-10-27',
      done: false,
      until: now.getTime() + 30 * 60000,
    });
    expect(engine.recommend(c).activities.map((a) => a.key)).toEqual(['routine:breakfast']);
    expect(
      engine.recommend({ ...c, now: new Date('2026-10-27T13:16:00') }).activities,
    ).toHaveLength(2);
  });
  it('mantém refeições após a janela e respeita os dias configurados', () => {
    const activities = engine.recommend(
      context({ now: new Date('2026-10-27T16:00:00') }),
    ).activities;
    expect(activities.map((a) => a.key)).toEqual(['routine:lunch', 'routine:breakfast']);
    expect(activities[0]!.reason).toContain('ainda não está marcado como feito hoje');
    expect(activities[0]!.reason).toContain('Se ainda fizer sentido');
    const c = context();
    c.routine!.preferences.days = [1];
    expect(engine.recommend(c).activities).toEqual([]);
  });
  it('mantém café da manhã após o horário sem antecipar almoço e jantar', () => {
    const activities = engine.recommend(
      context({ now: new Date('2026-10-27T09:00:00') }),
    ).activities;
    expect(activities.map((a) => a.key)).toEqual(['routine:breakfast']);
    expect(activities[0]!.reason).toContain('já passou');
  });
  it('prioriza a refeição atual e mantém as anteriores como possibilidades', () => {
    const activities = engine.recommend(
      context({ now: new Date('2026-10-27T19:30:00') }),
    ).activities;
    expect(activities.map((a) => a.key)).toEqual([
      'routine:dinner',
      'routine:lunch',
      'routine:breakfast',
    ]);
    expect(
      engine
        .recommend(context({ now: new Date('2026-10-27T21:00:00') }))
        .activities.map((a) => a.key),
    ).toEqual(['routine:dinner', 'routine:lunch', 'routine:breakfast']);
  });
  it('Agora não expira mesmo depois do fim da janela e Já fiz remove apenas a refeição do dia', () => {
    const c = context({ now: new Date('2026-10-27T16:00:00') });
    c.routine!.states.push({
      id: 'lunch',
      date: '2026-10-27',
      done: false,
      until: new Date('2026-10-27T16:30:00').getTime(),
    });
    expect(engine.recommend(c).activities.map((a) => a.key)).toEqual(['routine:breakfast']);
    expect(
      engine.recommend({ ...c, now: new Date('2026-10-27T16:31:00') }).activities[0]!.key,
    ).toBe('routine:lunch');
    c.routine!.states[0]!.done = true;
    expect(
      engine.recommend({ ...c, now: new Date('2026-10-27T17:00:00') }).activities.map((a) => a.key),
    ).toEqual(['routine:breakfast']);
  });
  it('permite marcar refeição passada pela interface sem criar tarefas', async () => {
    useRoutine().save({ preferences: { ...defaultRoutine(), enabled: true } });
    const wrapper = mount(ActivitySuggestions, {
      props: { now: new Date('2026-10-27T16:00:00'), minutes: 60, compact: true },
    });
    expect(wrapper.find('.suggested-task').text()).toContain('Almoçar');
    expect(wrapper.find('.suggested-task').text()).toContain('já passou');
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Já fiz')!
      .trigger('click');
    expect(wrapper.find('.suggested-task').text()).toContain('Café da manhã');
    expect(useRoutine().data.states.find((s) => s.id === 'lunch')?.done).toBe(true);
    expect(useTasks().data.tasks).toHaveLength(0);
    wrapper.unmount();
  });
  it('preserva registros existentes e persiste resposta após recriar o store', () => {
    const tasks = useTasks(),
      habits = useHabits(),
      routine = useRoutine();
    tasks.save(task('t'));
    const before = JSON.stringify({ tasks: tasks.data, habits: habits.data });
    expect(routine.save({ preferences: { ...defaultRoutine(), enabled: true } })).toBe(true);
    expect(routine.respond('lunch', '2026-10-27', true, 0)).toBe(true);
    expect(JSON.stringify({ tasks: tasks.data, habits: habits.data })).toBe(before);
    setActivePinia(createPinia());
    expect(useRoutine().data.states[0]!.done).toBe(true);
  });
  it('protege armazenamento inválido sem sobrescrever o original', () => {
    localStorage.setItem(ROUTINE_KEY, '{broken');
    const routine = useRoutine();
    expect(routine.blocked).toBe(true);
    expect(routine.save({ timer: true })).toBe(false);
    expect(localStorage.getItem(ROUTINE_KEY)).toBe('{broken');
  });
  it('contexto aplica exceções de disponibilidade e trabalho', () => {
    const routine = useRoutine();
    expect(
      routine.save({
        preferences: {
          ...defaultRoutine(),
          enabled: true,
          work: [{ start: '09:00', end: '12:00' }],
        },
        exceptions: [{ date: '2026-10-27', unavailable: [{ start: '14:00', end: '15:00' }] }],
      }),
    ).toBe(true);
    const tasks = useTasks();
    tasks.save(task('profissional', { integrationName: 'Portal' }));
    const snapshot = useRecommendationContext(
      () => now,
      () => 60,
    ).value;
    expect(engine.recommend(snapshot).activities.some((a) => a.key === 'task:profissional')).toBe(
      false,
    );
    const plan = planDay(snapshot, {
      date: '2026-10-27',
      start: '08:00',
      end: '18:00',
      unavailable: [],
    });
    expect(plan.plan.unavailable).toContainEqual({ start: '14:00', end: '15:00' });
    expect(plan.activities.map((a) => String(a.type))).not.toContain('routine');
    expect(plan.plan.entries.some((e) => e.key.startsWith('routine:'))).toBe(false);
  });
  it('persiste foco pausado e permite continuar sem contar tempo parado', () => {
    const focus = useFocusExecution();
    focus.start({ key: 'task:t', title: 'T', type: 'task' }, 1000);
    focus.pause(6000);
    setActivePinia(createPinia());
    const reloaded = useFocusExecution();
    expect(reloaded.current?.elapsed).toBe(5000);
    expect(reloaded.current?.since).toBe(null);
    reloaded.resume(20000);
    reloaded.pause(22000);
    expect(reloaded.current?.elapsed).toBe(7000);
  });
  it('Já fiz na interface não cria produtividade nem consistência', async () => {
    useRoutine().save({ preferences: { ...defaultRoutine(), enabled: true } });
    const wrapper = mount(ActivitySuggestions, { props: { now, minutes: 60, compact: true } });
    expect(wrapper.text()).toContain('Minha Única Coisa');
    const button = wrapper.findAll('button').find((b) => b.text().includes('Já fiz'))!;
    await button.trigger('click');
    expect(useRoutine().data.states[0]?.done).toBe(true);
    expect(useTasks().data.tasks).toHaveLength(0);
    expect(useHabits().data.completions).toHaveLength(0);
    wrapper.unmount();
  });
  it('configuração é opcional e permite salvar ajustes diários', () => {
    const wrapper = mount(RoutineSettings);
    expect(wrapper.text()).toContain('Usar minha rotina');
    expect(useRoutine().data.preferences.enabled).toBe(false);
    wrapper.unmount();
  });
  it('permite escolher alternativa como foco sem editar a atividade', async () => {
    const tasks = useTasks();
    tasks.save(task('a'));
    tasks.save(task('b'));
    tasks.save(task('c'));
    tasks.save(task('d'));
    const wrapper = mount(ActivitySuggestions, { props: { now, minutes: 60, compact: true } });
    expect(wrapper.findAll('.alternatives button')).toHaveLength(2);
    const alternative = wrapper.find('.alternatives button');
    const title = alternative.find('strong').text();
    await alternative.trigger('click');
    expect(wrapper.find('.suggested-task h3').text()).toBe(title);
    expect(tasks.data.tasks.every((t) => t.status === 'pending')).toBe(true);
    wrapper.unmount();
  });
  it('protege a recomendação crítica da escolha de uma alternativa', async () => {
    const tasks = useTasks();
    tasks.save(task('urgente', { priority: 'urgent' }));
    tasks.save(task('b'));
    const wrapper = mount(ActivitySuggestions, { props: { now, minutes: 60, compact: true } });
    expect(wrapper.find('.alternatives button').attributes('disabled')).toBeDefined();
    await wrapper.find('.alternatives button').trigger('click');
    expect(wrapper.find('.suggested-task h3').text()).toBe('urgente');
    wrapper.unmount();
  });
  it('Agora não da rotina persiste intervalo sem dispensar a refeição no dia', async () => {
    useRoutine().save({ preferences: { ...defaultRoutine(), enabled: true } });
    const wrapper = mount(ActivitySuggestions, { props: { now, minutes: 60, compact: true } });
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Agora não')!
      .trigger('click');
    expect(useRoutine().data.states[0]!.done).toBe(false);
    expect(wrapper.find('.suggested-task').text()).not.toContain('Almoçar');
    wrapper.unmount();
    setActivePinia(createPinia());
    expect(useRoutine().data.states[0]!.until).toBe(now.getTime() + 30 * 60000);
  });
  it('planeja trabalho dentro da janela habitual sem tornar refeições tarefas', () => {
    const c = context({ tasks: [task('trabalho', { integrationName: 'Portal', duration: 30 })] });
    c.routine!.preferences.work = [{ start: '14:00', end: '17:00' }];
    const result = planDay(c, {
      date: '2026-10-27',
      start: '08:00',
      end: '18:00',
      unavailable: [],
    });
    expect(result.plan.entries.find((e) => e.key === 'task:trabalho')?.time).toBe('14:00');
    expect(result.plan.entries.some((e) => e.key.startsWith('routine:'))).toBe(false);
  });
  it('pausa e retoma sessões profissionais pela estrutura existente', async () => {
    const tasks = useTasks();
    tasks.save(task('work', { integrationName: 'Portal' }));
    const wrapper = mount(ActivitySuggestions, { props: { now, minutes: 60, compact: true } });
    await wrapper.find('.suggestion-actions .primary').trigger('click');
    expect(wrapper.find('.focus-current').exists()).toBe(true);
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Pausar')!
      .trigger('click');
    expect(useFocusExecution().current?.since).toBe(null);
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Continuar')!
      .trigger('click');
    expect(useFocusExecution().current?.since).toBe(now.getTime());
    await wrapper.find('.focus-current .primary').trigger('click');
    expect(tasks.data.tasks[0]!.status).toBe('done');
    expect(useFocusExecution().current).toBe(null);
    wrapper.unmount();
  });
});
