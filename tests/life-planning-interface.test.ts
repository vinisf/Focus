// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import GoalsView from '../src/views/GoalsView.vue';
import WeekView from '../src/views/WeekView.vue';
import BackupSettings from '../src/components/BackupSettings.vue';
import FocusView from '../src/views/FocusView.vue';
import { useLifePlanning } from '../src/stores/lifePlanning';
import { useTasks } from '../src/stores/tasks';
import { LIFE_PLANNING_KEY } from '../src/services/lifePlanningRepository';
import { snapshot } from '../src/services/fullBackup';
let wrapper: VueWrapper;
const button = (label: string) => wrapper.findAll('button').find((b) => b.text() === label)!;
beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  vi.stubGlobal(
    'confirm',
    vi.fn(() => true),
  );
});
afterEach(() => {
  wrapper?.unmount();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it('creates, edits and deletes an area and goal with milestones and existing task links', async () => {
  useTasks().save({
    id: 'existing',
    title: 'Tarefa de exemplo',
    description: '',
    categoryId: '0',
    dueDate: '',
    plannedDate: '',
    time: '',
    priority: 'medium',
    importance: 'medium',
    duration: 30,
    status: 'pending',
    createdAt: '2026-11-01T12:00:00Z',
    completedAt: null,
    recurrence: null,
  });
  const legacy = localStorage.getItem('focus.v1');
  wrapper = mount(GoalsView);
  expect(wrapper.text()).toContain('Nenhuma meta é preenchida automaticamente');
  await wrapper.get('form input').setValue('Área de exemplo');
  await wrapper.get('form').trigger('submit');
  await button('Nova meta').trigger('click');
  const form = wrapper.get('form[aria-label="Editar meta"]');
  await form.get('input').setValue('Meta de exemplo');
  await form
    .findAll('input')
    .find((i) => i.element.parentElement?.textContent?.includes('Novo marco'))!
    .setValue('Entrega verificável');
  await button('Adicionar marco').trigger('click');
  await form.findAll('input[type=checkbox]')[0]!.setValue(true);
  await form.findAll('input[type=checkbox]')[1]!.setValue(true);
  await form.trigger('submit');
  expect(useLifePlanning().data.goals[0]!.taskIds).toEqual(['existing']);
  expect(wrapper.text()).toContain('100%');
  await button('Editar meta Meta de exemplo').trigger('click');
  await wrapper.get('form[aria-label="Editar meta"] input').setValue('Meta alterada');
  await wrapper.get('form[aria-label="Editar meta"]').trigger('submit');
  expect(wrapper.text()).toContain('Meta alterada');
  await button('Excluir meta Meta alterada').trigger('click');
  expect(useLifePlanning().data.goals).toHaveLength(0);
  await button('Excluir área Área de exemplo').trigger('click');
  expect(useLifePlanning().data.areas).toHaveLength(0);
  expect(localStorage.getItem('focus.v1')).toBe(legacy);
});
it('creates an unscheduled flexible block, moves it manually and requires confirmation to cancel', async () => {
  wrapper = mount(WeekView);
  expect(wrapper.findAll('.week-grid > section')).toHaveLength(7);
  await button('Novo bloco').trigger('click');
  await wrapper.get('form[aria-label="Editar bloco"] input').setValue('Bloco de exemplo');
  await wrapper.get('form[aria-label="Editar bloco"]').trigger('submit');
  expect(wrapper.text()).toContain('Sem horário fechado');
  await button('Editar / mover Bloco de exemplo').trigger('click');
  await wrapper.get('form[aria-label="Editar bloco"] input[type=date]').setValue('2026-11-16');
  await wrapper.get('form[aria-label="Editar bloco"]').trigger('submit');
  expect(useLifePlanning().data.blocks[0]!.date).toBe('2026-11-16');
  await wrapper.get('.life-inline input[type=date]').setValue('2026-11-16');
  vi.mocked(confirm).mockReturnValueOnce(false);
  await button('Cancelar bloco').trigger('click');
  expect(useLifePlanning().data.blocks[0]!.status).toBe('planned');
  await button('Cancelar bloco').trigger('click');
  expect(useLifePlanning().data.blocks[0]!.status).toBe('cancelled');
  await button('Excluir bloco').trigger('click');
  expect(useLifePlanning().data.blocks).toHaveLength(0);
});
it('shows storage corruption without permitting edits or deleting the original', () => {
  localStorage.setItem(LIFE_PLANNING_KEY, '{broken');
  wrapper = mount(GoalsView);
  expect(wrapper.get('[role=alert]').text()).toContain('preservados');
  expect(wrapper.get('fieldset').attributes('disabled')).toBeDefined();
  expect(localStorage.getItem(LIFE_PLANNING_KEY)).toBe('{broken');
});
it('keeps the application navigable when the browser denies access to localStorage itself', async () => {
  vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
    throw new DOMException('Storage denied', 'SecurityError');
  });
  wrapper = mount(FocusView);
  expect(wrapper.find('[role=alert]').exists()).toBe(true);
  await wrapper
    .findAll('nav button')
    .find((b) => b.text() === 'Metas')!
    .trigger('click');
  expect(wrapper.get('h1').text()).toBe('Metas');
  expect(wrapper.get('.life-planning fieldset').attributes('disabled')).toBeDefined();
});
it('keeps the backup confirmation hidden until a file is selected', () => {
  wrapper = mount(BackupSettings);
  expect(wrapper.find('input[type=file]').exists()).toBe(true);
  expect(wrapper.find('input[type=checkbox]').exists()).toBe(false);
  expect(wrapper.text()).toContain('Credenciais não são incluídas');
});
it('validates a selected backup before showing confirmation and supports cancelling without mutation', async () => {
  wrapper = mount(BackupSettings);
  const before = snapshot();
  const input = wrapper.get('input[type=file]');
  Object.defineProperty(input.element, 'files', {
    configurable: true,
    value: [{ size: 100, text: async () => JSON.stringify(before) }],
  });
  await input.trigger('change');
  await flushPromises();
  expect(button('Importar e substituir dados').attributes('disabled')).toBeDefined();
  await wrapper.get('input[type=checkbox]').setValue(true);
  expect(button('Importar e substituir dados').attributes('disabled')).toBeUndefined();
  await button('Cancelar importação').trigger('click');
  expect(wrapper.find('input[type=checkbox]').exists()).toBe(false);
  expect(snapshot()).toEqual(before);
  Object.defineProperty(input.element, 'files', {
    configurable: true,
    value: [{ size: 100, text: async () => '{broken' }],
  });
  await input.trigger('change');
  await flushPromises();
  expect(wrapper.get('[role=alert]').text()).toContain('inválido');
  expect(wrapper.find('input[type=checkbox]').exists()).toBe(false);
  expect(snapshot()).toEqual(before);
});
it('integrates both screens into navigation without opening the task editor', async () => {
  wrapper = mount(FocusView);
  for (const name of ['Metas', 'Semana']) {
    await wrapper
      .findAll('nav button')
      .find((b) => b.text() === name)!
      .trigger('click');
    expect(wrapper.get('h1').text()).toBe(name);
    expect(wrapper.find('.top-add').exists()).toBe(false);
    expect(wrapper.find('.page-heading .primary').exists()).toBe(false);
    expect(wrapper.findAll('h1')).toHaveLength(1);
    expect(wrapper.find('[role=dialog]').exists()).toBe(false);
  }
});
