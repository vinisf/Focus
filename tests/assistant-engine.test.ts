// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { recommendationEngine as engine, newRound } from '../src/services/RecommendationEngine';
import { planDay } from '../src/utils/dayPlanner';
import { normalizeActivity } from '../src/utils/activityTiming';
import { useAssistant } from '../src/stores/assistant';
import { useTasks } from '../src/stores/tasks';
import { usePlanning } from '../src/stores/planning';
import { useRecommendationContext } from '../src/composables/useRecommendationContext';
import { LocalRepository } from '../src/services/repository';
import ActivitySuggestions from '../src/components/ActivitySuggestions.vue';
import PlanTomorrow from '../src/views/PlanTomorrow.vue';
import type { RecommendationContext } from '../src/types/recommendations';
import type { Task } from '../src/types';
import type { Platform } from '../src/types/platforms';
import type { IemaTicket } from '../src/types/iema';
import type { Habit } from '../src/types/habits';
const now = new Date('2026-10-22T10:00:00');
const task = (id: string, fields: Partial<Task> = {}): Task => ({
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
  createdAt: '2026-10-01T10:00:00',
  completedAt: null,
  recurrence: null,
  ...fields,
});
const context = (fields: Partial<RecommendationContext> = {}): RecommendationContext => ({
  now,
  minutes: 60,
  tasks: [],
  habits: [],
  completions: [],
  ...fields,
});
const habit = (fields: Partial<Habit> = {}): Habit => ({
  id: 'h',
  name: 'Ler',
  description: '',
  categoryId: null,
  icon: 'book',
  frequency: { kind: 'daily' },
  preferredTime: '10:00',
  createdAt: '2026-10-01T10:00:00',
  status: 'active',
  plans: [{ from: '2026-10-01', active: true, frequency: { kind: 'daily' } }],
  ...fields,
});
const platform = (fields: Partial<Platform> = {}): Platform => ({
  key: 'platform:p',
  name: 'Plataforma',
  source: 'manual',
  originalId: null,
  originalStatus: '',
  status: 'pending',
  documentation: null,
  link: null,
  notes: '',
  owner: '',
  originalPriority: '',
  priority: null,
  dueDate: null,
  row: 0,
  syncedAt: now.toISOString(),
  estimate: null,
  blocked: false,
  localNotes: '',
  nextAction: 'Verificar documentação',
  progress: '',
  ...fields,
});
const ticket = (fields: Partial<IemaTicket> = {}): IemaTicket => ({
  key: 'iema:connection:1',
  id: 1,
  title: 'Chamado',
  status: { code: 2, name: 'processing', label: 'Em atendimento' },
  priority: null,
  due_at: null,
  updated_at: '2026-01-01T12:00:00',
  url: 'https://example.com',
  mine: true,
  available: false,
  estimate: null,
  ...fields,
});
beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
});
describe('motor diário e rodadas', () => {
  it('coloca vencidas e vencendo hoje na faixa máxima, antes de hábitos e tarefas sem prazo', () => {
    const c = context({
      tasks: [
        task('flex'),
        task('today', { dueDate: '2026-10-22' }),
        task('late', { dueDate: '2026-10-21' }),
      ],
      habits: [habit()],
    });
    const result = engine.recommend(c);
    expect(result.activities.slice(0, 2).map((a) => a.key)).toEqual(['task:late', 'task:today']);
    expect(result.activities.slice(0, 2).every((a) => a.tier === 0)).toBe(true);
    expect(result.normalized.find((a) => a.key === 'task:flex')?.deadlineAt).toBeNull();
    expect(JSON.stringify(c.tasks)).not.toContain('deadlineTime');
  });
  it('mantém importância alta mesmo sem vencimento e prioriza planejamento antes do prazo', () => {
    const result = engine.recommend(
      context({
        tasks: [
          task('flex'),
          task('important', { importance: 'high' }),
          task('planned', { plannedDate: '2026-10-22', dueDate: '2026-10-26' }),
        ],
      }),
    );
    expect(result.activities.map((a) => a.key)).toEqual([
      'task:important',
      'task:planned',
      'task:flex',
    ]);
  });
  it('o vencimento de hoje prevalece sobre planejamento futuro', () => {
    expect(
      engine.recommend(
        context({ tasks: [task('due', { dueDate: '2026-10-22', plannedDate: '2026-10-25' })] }),
      ).activities[0]?.tier,
    ).toBe(0);
  });
  it('ordena compromisso em cinco minutos antes de prazo às 23h e evita cruzar compromissos', () => {
    const c = context({
      tasks: [
        task('tonight', { dueDate: '2026-10-22', deadlineTime: '23:00', duration: 3 }),
        task('appointment', { plannedDate: '2026-10-22', scheduledTime: '10:05', mandatory: true }),
        task('long', { duration: 60 }),
      ],
    });
    const result = engine.recommend(c);
    expect(result.activities[0]?.key).toBe('task:appointment');
    expect(result.activities.map((a) => a.key)).toContain('task:tonight');
    expect(result.activities.map((a) => a.key)).not.toContain('task:long');
  });
  it('aplica horário livre e indisponibilidade sem inventar uma duração', () => {
    expect(
      engine.recommend(context({ tasks: [task('long')], freeUntil: '10:10' })).activities,
    ).toEqual([]);
    expect(
      engine.recommend(context({ tickets: [ticket()], freeUntil: '10:10' })).activities,
    ).toEqual([]);
    expect(
      engine.recommend(
        context({
          tasks: [task('short', { duration: 5 })],
          unavailable: [{ start: '10:00', end: '11:00' }],
        }),
      ).activities,
    ).toEqual([]);
  });
  it('pula sem mudar dados, reinicia ao fim e retorna à prioridade maior', () => {
    const c = context({ tasks: [task('critical', { dueDate: '2026-10-22' }), task('flex')] });
    const before = JSON.stringify(c);
    const first = engine.recommend(c);
    const skipped = engine.skip(first.activities[0]!, c, first.round);
    expect(skipped.activities[0]?.key).toBe('task:flex');
    const restarted = engine.skip(skipped.activities[0]!, c, skipped.round);
    expect(restarted.restarted).toBe(true);
    expect(restarted.round.number).toBe(2);
    expect(restarted.activities[0]?.key).toBe('task:critical');
    expect(JSON.stringify(c)).toBe(before);
  });
  it('não fica em loop quando há apenas uma atividade', () => {
    const c = context({ tasks: [task('single')] });
    const initial = engine.recommend(c);
    const next = engine.skip(initial.activities[0]!, c, initial.round);
    expect(next.activities).toHaveLength(1);
    expect(next.restarted).toBe(true);
    expect(engine.recommend(c, next.round).restarted).toBe(false);
  });
  it('uma nova urgência pode retornar uma vez; pular novamente respeita a rodada', () => {
    const c = context({ tasks: [task('a'), task('b')] });
    const initial = engine.recommend(c);
    const skipped = engine.skip(initial.activities[0]!, c, initial.round);
    c.tasks[0]!.dueDate = '2026-10-22';
    const urgent = engine.recommend(c, skipped.round);
    expect(urgent.activities[0]?.key).toBe('task:a');
    const again = engine.skip(urgent.activities[0]!, c, urgent.round);
    expect(again.activities[0]?.key).toBe('task:b');
    expect(engine.recommend(c, again.round).activities[0]?.key).toBe('task:b');
  });
  it('recalcula após conclusão, edição, mudança de tempo e virada de dia', () => {
    const c = context({ tasks: [task('a'), task('b')] });
    const skipped = engine.skip(engine.recommend(c).activities[0]!, c);
    c.tasks[0]!.status = 'done';
    expect(engine.recommend(c, skipped.round).activities.map((a) => a.key)).toEqual(['task:b']);
    expect(engine.recommend({ ...c, minutes: 10 }, skipped.round).activities).toEqual([]);
    expect(
      engine.recommend({ ...c, now: new Date('2026-10-23T10:00:00') }, skipped.round).round,
    ).toEqual(newRound('2026-10-23'));
  });
  it('reconsidera ao entrar numa janela obrigatória sem mudar o cadastro', () => {
    const c = context({
      tasks: [
        task('meeting', { scheduledTime: '11:00', plannedDate: '2026-10-22', mandatory: true }),
        task('other', { duration: 5 }),
      ],
      now: new Date('2026-10-22T10:30:00'),
    });
    const saved = {
      date: '2026-10-22',
      number: 1,
      skipped: [{ key: 'task:meeting', urgency: null }],
    };
    expect(engine.recommend(c, saved).activities[0]?.key).toBe('task:other');
    expect(
      engine.recommend({ ...c, now: new Date('2026-10-22T10:50:00') }, saved).activities[0]?.key,
    ).toBe('task:meeting');
  });
  it('respeita conclusão, dias permitidos, meta semanal e recuperação dos hábitos', () => {
    const h = habit();
    const complete = {
      id: 'c',
      habitId: h.id,
      date: '2026-10-22',
      completedAt: '2026-10-22T09:00:00',
    };
    expect(engine.recommend(context({ habits: [h], completions: [complete] })).activities).toEqual(
      [],
    );
    expect(
      engine.recommend(
        context({
          habits: [habit({ minIntervalHours: 48 })],
          completions: [{ ...complete, date: '2026-10-21', completedAt: '2026-10-21T09:00:00' }],
        }),
      ).activities,
    ).toEqual([]);
    const weekly = habit({
      plans: [{ from: '2026-10-01', active: true, frequency: { kind: 'weekly', target: 1 } }],
    });
    expect(
      engine.recommend(
        context({ habits: [weekly], completions: [{ ...complete, date: '2026-10-20' }] }),
      ).activities,
    ).toEqual([]);
    const forbidden = habit({
      plans: [{ from: '2026-10-01', active: true, frequency: { kind: 'weekdays', days: [0] } }],
    });
    expect(engine.recommend(context({ habits: [forbidden] })).activities).toEqual([]);
  });
  it('considera IEMA em leitura e prioriza assumidos sem urgência por idade', () => {
    const available = ticket({ key: 'iema:new', mine: false, available: true });
    const result = engine.recommend(
      context({
        tickets: [
          available,
          ticket(),
          ticket({ key: 'iema:done', status: { code: 3, name: 'done', label: 'Concluído' } }),
        ],
      }),
    );
    expect(result.activities.map((a) => a.key)).toEqual(['iema:connection:1']);
    expect(result.activities[0]?.tier).toBe(2);
    expect(result.activities[0]?.duration).toBeNull();
  });
  it('normaliza identidades, bloqueios, duração desconhecida e não duplica integrações importadas', () => {
    const result = engine.recommend(
      context({
        platforms: [
          platform(),
          platform({ key: 'platform:blocked', blocked: true }),
          platform({ key: 'platform:done', status: 'done' }),
        ],
      }),
    );
    expect(result.normalized).toHaveLength(1);
    expect(result.normalized[0]).toMatchObject({
      source: 'platform',
      duration: null,
      deadlineAt: null,
      nextAction: 'Verificar documentação',
    });
    expect(
      engine.recommend(
        context({
          platforms: [platform()],
          tasks: [task('imported', { integrationName: 'Plataforma' })],
        }),
      ).activities,
    ).toHaveLength(1);
  });
  it('persiste a rodada e preserva cadastros e sessões existentes após reabrir', () => {
    const store = useTasks();
    store.save(task('a'));
    store.save(task('b'));
    const planning = usePlanning();
    planning.start('task:a', 'task', now, 20);
    planning.stop(new Date(now.getTime() + 60000));
    const c = context({ tasks: store.data.tasks });
    const next = engine.skip(engine.recommend(c).activities[0]!, c);
    expect(useAssistant().save({ round: next.round })).toBe(true);
    const original = localStorage.getItem('focus.v1');
    setActivePinia(createPinia());
    expect(engine.recommend(c, useAssistant().data.round).activities[0]?.key).toBe('task:b');
    expect(localStorage.getItem('focus.v1')).toBe(original);
    expect(usePlanning().data.sessions).toHaveLength(1);
    expect(new LocalRepository().load()?.tasks).toHaveLength(2);
  });
  it('não substitui preferências corrompidas', () => {
    localStorage.setItem('focus.assistant.v1', 'original ilegível');
    const assistant = useAssistant();
    expect(assistant.blocked).toBe(true);
    expect(assistant.save({ imminentMinutes: 10 })).toBe(false);
    expect(localStorage.getItem('focus.assistant.v1')).toBe('original ilegível');
  });
  it('reconhece bloqueio de uma tarefa importada e mantém outra integração na cota', () => {
    const result = engine.recommend(
      context({
        integrationDailyLimit: 1,
        tasks: [
          task('blocked', { integrationName: 'a', blocked: true }),
          task('free', { integrationName: 'b' }),
        ],
      }),
    );
    expect(result.activities.map((a) => a.key)).toEqual(['task:free']);
  });
  it('respeita descanso noturno e a indisponibilidade do plano salvo', () => {
    const store = useTasks();
    store.save(task('work'));
    const assistant = useAssistant();
    assistant.save({ restStart: '22:00', restEnd: '07:00' });
    let clock = new Date('2026-10-22T23:00:00');
    const snapshot = useRecommendationContext(
      () => clock,
      () => 60,
    );
    expect(engine.recommend(snapshot.value).activities).toEqual([]);
    expect(snapshot.value.preferences?.restUntil).toBe(Date.parse('2026-10-23T07:00:00'));
    clock = new Date('2026-10-23T10:00:00');
    assistant.savePlan({
      date: '2026-10-23',
      start: '08:00',
      end: '18:00',
      entries: [],
      unavailable: [{ start: '09:00', end: '11:00' }],
    });
    expect(engine.recommend(snapshot.value).activities).toEqual([]);
  });
  it('a interface reinicia a rodada sem concluir ou alterar datas', async () => {
    const store = useTasks();
    store.save(task('a'));
    store.save(task('b'));
    const wrapper = mount(ActivitySuggestions, { props: { now, minutes: 60, compact: true } });
    const original = JSON.stringify(store.data);
    await wrapper.find('.postpone-action').trigger('click');
    expect(wrapper.find('.suggested-task h3').text()).toBe('b');
    await wrapper.find('.postpone-action').trigger('click');
    expect(wrapper.find('.suggested-task h3').text()).toBe('a');
    expect(wrapper.find('.round-notice').text()).toContain('Você já percorreu');
    expect(JSON.stringify(store.data)).toBe(original);
    wrapper.unmount();
  });
});
describe('planejamento opcional de amanhã', () => {
  const options = {
    date: '2026-10-23',
    start: '08:00',
    end: '18:00',
    unavailable: [{ start: '12:00', end: '13:00' }],
  };
  it('reserva compromissos, indisponibilidade, folgas e mantém vencimentos', () => {
    const c = context({
      tasks: [
        task('meeting', {
          mandatory: true,
          plannedDate: '2026-10-23',
          scheduledTime: '09:00',
          duration: 60,
        }),
        ...Array.from({ length: 20 }, (_, i) =>
          task(`work${i}`, { duration: 45, dueDate: '2026-10-25' }),
        ),
      ],
      habits: [habit()],
      tickets: [ticket()],
    });
    const original = JSON.stringify(c);
    const result = planDay(c, options);
    expect(result.plan.entries.find((e) => e.key === 'task:meeting')).toMatchObject({
      time: '09:00',
      included: true,
    });
    const scheduled = result.plan.entries.filter((e) => e.included && e.time);
    expect(scheduled.length).toBeGreaterThan(1);
    expect(scheduled.length).toBeLessThan(15);
    for (const e of scheduled) {
      const duration = result.activities.find((a) => a.key === e.key)!.duration!;
      const start = Date.parse(`${options.date}T${e.time}:00`),
        end = start + duration * 60000;
      expect(
        start >= Date.parse('2026-10-23T13:00:00') || end <= Date.parse('2026-10-23T12:00:00'),
      ).toBe(true);
    }
    expect(JSON.stringify(c)).toBe(original);
    expect(result.plan.entries.find((e) => e.key === ticket().key)?.included).toBe(false);
  });
  it('não ultrapassa orçamento cumulativo de trabalho ao planejar', () => {
    const c = context({
      tasks: Array.from({ length: 8 }, (_, i) =>
        task(`integration${i}`, { integrationName: `p${i}`, duration: 30 }),
      ),
      preferences: {
        maxWorkMinutes: 40,
        restUntil: null,
        style: 'any',
        categoryIds: [],
        workCategoryIds: [],
        excludedSources: [],
      },
    });
    const result = planDay(c, options);
    expect(result.plan.entries.filter((e) => e.included)).toHaveLength(1);
  });
  it('aceita datas planejadas sem mudar prazo, recorrência ou histórico', async () => {
    const store = useTasks();
    store.save(
      task('t', {
        dueDate: '2026-10-25',
        plannedDate: '2026-10-22',
        recurrence: { kind: 'weekly', days: [1] },
      }),
    );
    const wrapper = mount(PlanTomorrow, { props: { now } });
    await wrapper.find('button.primary').trigger('click');
    expect(store.data.tasks[0]).toMatchObject({
      plannedDate: '2026-10-23',
      dueDate: '2026-10-25',
      recurrence: { kind: 'weekly', days: [1] },
      status: 'pending',
    });
    setActivePinia(createPinia());
    expect(useAssistant().data.plans[0]?.date).toBe('2026-10-23');
    expect(useTasks().data.tasks[0]?.dueDate).toBe('2026-10-25');
    wrapper.unmount();
  });
  it('planejar e adiar não altera o vencimento, mesmo antes do prazo', () => {
    const store = useTasks();
    store.save(task('t', { dueDate: '2026-10-25', plannedDate: '2026-10-22' }));
    expect(store.planMany([{ id: 't', date: '2026-10-24', time: '14:00' }])).toBe(true);
    expect(store.data.tasks[0]?.dueDate).toBe('2026-10-25');
    expect(
      normalizeActivity(
        engine.recommend(context({ tasks: store.data.tasks, now: new Date('2026-10-24T10:00:00') }))
          .activities[0]!,
      ).scheduledAt,
    ).toBe(Date.parse('2026-10-24T14:00:00'));
  });
});
