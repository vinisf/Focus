// @vitest-environment jsdom
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { mount, type VueWrapper } from '@vue/test-utils';
import { useTasks } from '../src/stores/tasks';
import { useHabits } from '../src/stores/habits';
import TaskEditor from '../src/components/TaskEditor.vue';
import HabitEditor from '../src/components/HabitEditor.vue';
import { LocalRepository } from '../src/services/repository';
import { LocalHabitRepository } from '../src/services/habitRepository';
import type { Task } from '../src/types';
import type { Habit } from '../src/types/habits';
const task = (id = 'task'): Task => ({
  id,
  title: id,
  categoryId: '0',
  description: '',
  dueDate: '',
  time: '',
  plannedDate: '',
  priority: 'medium',
  importance: 'medium',
  duration: 30,
  status: 'pending',
  createdAt: '2026-10-12T12:00:00',
  completedAt: null,
  recurrence: null,
});
const habit = (id = 'habit'): Habit => ({
  id,
  name: id,
  categoryId: null,
  description: '',
  icon: 'leaf',
  frequency: { kind: 'daily' },
  preferredTime: '',
  createdAt: '2026-10-12T12:00:00',
  status: 'active',
  plans: [{ from: '2026-10-12', active: true, frequency: { kind: 'daily' } }],
});
let wrapper: VueWrapper | undefined;
beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
});
afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  vi.restoreAllMocks();
});
describe('exclusão de atividades', () => {
  it('exclui apenas a tarefa escolhida e preserva o vínculo de recorrência contra recriação', () => {
    const store = useTasks();
    store.save({
      ...task('first'),
      status: 'done',
      recurrence: { kind: 'daily', days: [] },
      nextId: 'next',
    });
    store.save(task('next'));
    expect(store.remove('next')).toBe(true);
    expect(new LocalRepository().load()?.tasks.map((t) => t.id)).toEqual(['first']);
    store.status(store.data.tasks[0]!, 'pending');
    store.status(store.data.tasks[0]!, 'done');
    expect(store.data.tasks).toHaveLength(1);
  });
  it('remove o histórico inteiro do hábito escolhido sem afetar os demais', () => {
    const store = useHabits();
    store.save(habit());
    store.save(habit('other'));
    store.setCompleted('habit', '2026-10-12', true);
    store.setCompleted('other', '2026-10-12', true);
    store.data.progress = [
      { habitId: 'habit', date: '2026-10-12', value: 1, updatedAt: '2026-10-12T12:00:00' },
    ];
    store.data.sessions = [{ habitId: 'habit', completedAt: '2026-10-12T12:00:00' }];
    expect(store.remove('habit')).toBe(true);
    const saved = new LocalHabitRepository().load()!;
    expect(saved.habits.map((h) => h.id)).toEqual(['other']);
    expect(saved.completions.map((c) => c.habitId)).toEqual(['other']);
    expect(saved.progress).toEqual([]);
    expect(saved.sessions).toEqual([]);
  });
  it('preserva os dados se o armazenamento falhar ou estiver bloqueado', () => {
    const tasks = useTasks(),
      habits = useHabits();
    tasks.save(task());
    habits.save(habit());
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    expect(tasks.remove('task')).toBe(false);
    expect(habits.remove('habit')).toBe(false);
    expect(tasks.data.tasks).toHaveLength(1);
    expect(habits.data.habits).toHaveLength(1);
    tasks.blocked = true;
    habits.blocked = true;
    expect(tasks.remove('task')).toBe(false);
    expect(habits.remove('habit')).toBe(false);
  });
  it('exige confirmação no editor de tarefa, permite voltar e não submete o formulário', async () => {
    const store = useTasks();
    store.save(task());
    wrapper = mount(TaskEditor, { props: { task: store.data.tasks[0]! } });
    await wrapper.find('.delete-activity > button').trigger('click');
    expect(store.data.tasks).toHaveLength(1);
    await wrapper.find('.delete-actions button').trigger('click');
    expect(wrapper.find('.delete-confirmation').exists()).toBe(false);
    await wrapper.find('.delete-activity > button').trigger('click');
    await wrapper.find('.delete-actions .delete-button').trigger('click');
    expect(store.data.tasks).toHaveLength(0);
    expect(wrapper.emitted('deleted')).toHaveLength(1);
    expect(wrapper.emitted('saved')).toBeUndefined();
  });
  it('avisa sobre o histórico antes de confirmar a exclusão do hábito', async () => {
    const store = useHabits();
    store.save(habit());
    wrapper = mount(HabitEditor, { props: { habit: store.data.habits[0]! } });
    await wrapper.find('.delete-activity > button').trigger('click');
    expect(wrapper.find('.delete-confirmation').text()).toContain('todo o seu histórico');
    expect(store.data.habits).toHaveLength(1);
    await wrapper.find('.delete-actions .delete-button').trigger('click');
    expect(store.data.habits).toHaveLength(0);
    expect(wrapper.emitted('deleted')).toHaveLength(1);
  });
  it('não oferece exclusão em cadastros novos', () => {
    wrapper = mount(TaskEditor, { props: { task: null } });
    expect(wrapper.find('.delete-activity').exists()).toBe(false);
    wrapper.unmount();
    wrapper = mount(HabitEditor, { props: { habit: null } });
    expect(wrapper.find('.delete-activity').exists()).toBe(false);
  });
});
