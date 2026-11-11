// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import App from '../src/App.vue';
import HabitEditor from '../src/components/HabitEditor.vue';
import { useHabits } from '../src/stores/habits';
import { useTasks } from '../src/stores/tasks';
import type { Habit } from '../src/types/habits';
import { habitIsDue } from '../src/utils/habits';

let wrapper: VueWrapper;
const today = '2026-10-15';
beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(today + 'T12:00:00'));
});
afterEach(() => {
  wrapper?.unmount();
  vi.useRealTimers();
});
async function navigate(name: string) {
  await wrapper
    .findAll('nav button')
    .find((b) => b.text().startsWith(name))!
    .trigger('click');
}

describe('hábitos na interface do Focus', () => {
  it('mantém o cadastro visível fora dos dias escolhidos e permite realizar no dia previsto', async () => {
    wrapper = mount(App);
    await navigate('Hábitos');
    await wrapper.find('.page-heading .primary').trigger('click');
    const editor = wrapper.findComponent(HabitEditor);
    await editor.find('input[placeholder="Qual prática você quer cultivar?"]').setValue('Nadar');
    await editor.find('select[aria-label="Frequência do hábito"]').setValue('weekdays');
    const days = editor.findAll('fieldset input[type="checkbox"]');
    for (const day of days) await day.setValue(false);
    await days[2]!.setValue(true);
    await editor.find('form').trigger('submit');
    expect(wrapper.find('.habit-management').text()).toContain('Nadar');
    await navigate('Hábitos');
    expect(wrapper.find('.habit-other-days').text()).toContain('Nadar');
    expect(wrapper.find('.habit-other-days').text()).toContain('Ter');
    expect(wrapper.find('.habit-other-days .habit-checkbox').exists()).toBe(false);
    expect(wrapper.find('.habits-today .count-pill').text()).toBe('0');
    await wrapper.find('.habit-other-days .habit-content').trigger('click');
    expect(wrapper.find('.habit-history-heading').text()).toContain('Nadar');

    wrapper.unmount();
    setActivePinia(createPinia());
    vi.setSystemTime(new Date('2026-10-20T12:00:00'));
    wrapper = mount(App);
    await navigate('Hábitos');
    expect(wrapper.find('.habit-other-days').exists()).toBe(false);
    expect(wrapper.find('.habits-today .count-pill').text()).toBe('1');
    await wrapper.find('input[aria-label="Realizado: Nadar"]').setValue(true);
    expect(useHabits().data.completions[0]?.date).toBe('2026-10-20');
  });
  it('cadastra um hábito genérico com meta específica e registra progresso quantitativo', async () => {
    wrapper = mount(App);
    await navigate('Hábitos');
    await wrapper.find('.page-heading .primary').trigger('click');
    const editor = wrapper.findComponent(HabitEditor);
    await editor
      .find('input[placeholder="Qual prática você quer cultivar?"]')
      .setValue('Devocional');
    await editor.find('input[aria-label="Meta do hábito"]').setValue('Ler 3 capítulos da Bíblia');
    await editor.find('select[aria-label="Tipo de acompanhamento"]').setValue('quantity');
    await editor.find('input[aria-label="Quantidade da meta"]').setValue(3);
    await editor.find('input[aria-label="Unidade da meta"]').setValue('capítulos');
    await editor.find('form').trigger('submit');
    expect(wrapper.find('.habit-definition').text()).toContain('Ler 3 capítulos da Bíblia');
    expect(useHabits().data.habits[0]!.name).toBe('Devocional');
    await navigate('Hábitos');
    expect(wrapper.find('.habit-goal').text()).toContain('Ler 3 capítulos da Bíblia');
    let input = wrapper.find('input[aria-label="Quantidade realizada: Devocional"]');
    await input.setValue(2);
    expect(wrapper.find('.habits-today').text()).toContain('0 de 1 realizados');
    expect(useHabits().data.completions).toHaveLength(0);
    await input.setValue(3);
    expect(wrapper.find('.habits-today').text()).toContain('1 de 1 realizados');
    await navigate('Desempenho');
    expect(wrapper.find('.consistency-summary').text()).toContain('100%');
    expect(wrapper.find('.productivity-summary').text()).toContain('Sem tarefas planejadas hoje');
    await navigate('Hábitos');
    expect(wrapper.find('.habit-record-goal').text()).toContain('3 / 3 capítulos');
    await wrapper.find('button[aria-label="Editar hábito Devocional"]').trigger('click');
    const editing = wrapper.findComponent(HabitEditor);
    await editing.find('input[aria-label="Meta do hábito"]').setValue('Ler 4 capítulos da Bíblia');
    await editing.find('input[aria-label="Quantidade da meta"]').setValue(4);
    await editing.find('form').trigger('submit');
    expect(wrapper.find('.habit-definition').text()).toContain('Ler 4 capítulos da Bíblia');
    expect(wrapper.find('.habit-record-goal').text()).toContain('3 / 3 capítulos');
    wrapper.unmount();
    vi.setSystemTime(new Date('2026-10-16T12:00:00'));
    wrapper = mount(App);
    await navigate('Hábitos');
    expect(wrapper.find('.habit-goal').text()).toContain('Ler 4 capítulos da Bíblia');
    input = wrapper.find('input[aria-label="Quantidade realizada: Devocional"]');
    await input.setValue(3);
    expect(wrapper.find('.habits-today').text()).toContain('0 de 1 realizados');
    await input.setValue(4);
    expect(wrapper.find('.habits-today').text()).toContain('1 de 1 realizados');
    expect(useHabits().data.habits).toHaveLength(1);
    expect(useHabits().data.completions).toHaveLength(2);
  });
  it('mostra estados neutros sem tarefas e sem hábitos previstos', async () => {
    wrapper = mount(App);
    await navigate('Desempenho');
    expect(wrapper.find('.productivity-summary').text()).toContain('Sem tarefas planejadas hoje');
    expect(wrapper.find('.consistency-summary').text()).toContain('Nenhum hábito previsto hoje');
    expect(wrapper.find('.performance-main').text()).not.toContain('0%');
    expect(wrapper.find('.performance-value').text()).toBe('—');
  });
  it('cria e realiza hábitos sem alterar tarefas, recomendações ou produtividade', async () => {
    const tasks = useTasks();
    tasks.save({
      id: 'api',
      title: 'Concluir integração',
      description: '',
      categoryId: '0',
      dueDate: '',
      time: '',
      plannedDate: today,
      priority: 'high',
      importance: 'high',
      duration: 30,
      status: 'pending',
      createdAt: new Date().toISOString(),
      completedAt: null,
      recurrence: null,
    });
    const original = localStorage.getItem('focus.v1');
    wrapper = mount(App, { attachTo: document.body });
    await navigate('Hábitos');
    await wrapper.find('.page-heading .primary').trigger('click');
    const editor = wrapper.findComponent(HabitEditor);
    await editor.find('input[placeholder="Qual prática você quer cultivar?"]').setValue('Caminhar');
    await editor.find('button[aria-label="Cuidado"]').trigger('click');
    await editor.find('form').trigger('submit');
    expect(useHabits().data.habits).toHaveLength(1);
    expect(useHabits().data.habits[0]!.icon).toBe('heart');
    await navigate('Hábitos');
    await wrapper.find('.habit-checkbox').setValue(true);
    expect(wrapper.find('.habits-today').text()).toContain('Hábitos: 1 de 1 realizados');
    await navigate('Desempenho');
    expect(wrapper.find('.consistency-summary').text()).toContain('100%');
    expect(wrapper.find('.productivity-summary').text()).toContain('0 de 1 tarefas concluídas');
    await navigate('Meu Dia');
    expect(wrapper.find('.suggested-task').text()).toContain('Concluir integração');
    expect(wrapper.find('.suggested-task').text()).not.toContain('Caminhar');
    expect(localStorage.getItem('focus.v1')).toBe(original);
    await navigate('Hábitos');
    await wrapper.find('.habit-checkbox').setValue(false);
    expect(useHabits().data.completions).toHaveLength(0);
    await wrapper.find('.habit-checkbox').setValue(true);
    await navigate('Tarefas');
    await wrapper.find('.check-task').trigger('click');
    await navigate('Desempenho');
    expect(wrapper.find('.productivity-summary').text()).toContain('1 de 1 tarefas concluídas');
    expect(wrapper.find('.consistency-summary').text()).toContain('1 de 1 realizações cumpridas');
    expect(useHabits().data.completions).toHaveLength(1);
  });
  it('valida dias específicos e permite edição sem prioridade de tarefa', async () => {
    wrapper = mount(App);
    await navigate('Hábitos');
    await wrapper.find('.page-heading .primary').trigger('click');
    let editor = wrapper.findComponent(HabitEditor);
    await editor.find('input[placeholder="Qual prática você quer cultivar?"]').setValue('Leitura');
    await editor.find('select[aria-label="Frequência do hábito"]').setValue('weekdays');
    const checkboxes = editor.findAll('fieldset input[type="checkbox"]');
    for (const checkbox of checkboxes) await checkbox.setValue(false);
    expect(editor.find('footer .primary').attributes('disabled')).toBeDefined();
    await checkboxes[2]!.setValue(true);
    await editor.find('form').trigger('submit');
    const habit = useHabits().data.habits[0]!;
    expect(habitIsDue(habit, [], today)).toBe(false);
    expect(habitIsDue(habit, [], '2026-10-20')).toBe(true);
    expect('priority' in habit).toBe(false);
    await wrapper.find('button[aria-label="Editar hábito Leitura"]').trigger('click');
    editor = wrapper.findComponent(HabitEditor);
    await editor
      .find('input[placeholder="Qual prática você quer cultivar?"]')
      .setValue('Ler três capítulos');
    await editor.find('select[aria-label="Frequência do hábito"]').setValue('weekly');
    await editor.find('input[aria-label="Meta semanal"]').setValue(3);
    await editor.find('form').trigger('submit');
    expect(useHabits().data.habits[0]!.name).toBe('Ler três capítulos');
    expect(useHabits().data.habits[0]!.frequency).toEqual({ kind: 'weekly', target: 3 });
  });
  it('permite consultar o calendário, corrigir dias passados e arquivar mantendo histórico', async () => {
    const store = useHabits();
    const habit: Habit = {
      id: 'walk',
      name: 'Caminhar',
      description: 'Uma volta ao ar livre',
      categoryId: null,
      icon: 'leaf',
      frequency: { kind: 'daily' },
      preferredTime: '07:00',
      createdAt: new Date('2026-10-01T12:00:00').toISOString(),
      status: 'active',
      plans: [{ from: '2026-10-01', frequency: { kind: 'daily' }, active: true }],
    };
    expect(store.save(habit)).toBe(true);
    store.setCompleted('walk', today, true);
    wrapper = mount(App);
    await navigate('Hábitos');
    expect(
      wrapper.findAll('.habit-calendar button').map((b) => b.attributes('aria-label')),
    ).toContain('14 de outubro de 2026: previsto');
    const yesterday = wrapper.find('button[aria-label="14 de outubro de 2026: previsto"]');
    await yesterday.trigger('click');
    expect(store.data.completions.map((c) => c.date).sort()).toEqual(['2026-10-14', today]);
    expect(
      wrapper
        .find('button[aria-label="14 de outubro de 2026: realizado"]')
        .attributes('aria-pressed'),
    ).toBe('true');
    expect(
      wrapper.find('button[aria-label="16 de outubro de 2026: previsto"]').attributes('disabled'),
    ).toBeDefined();
    await wrapper.find('button[aria-label="Arquivar Caminhar"]').trigger('click');
    expect(store.data.habits[0]!.status).toBe('archived');
    expect(store.data.completions).toHaveLength(2);
    await wrapper.find('.archive-filter input').setValue(true);
    expect(wrapper.find('.habit-archived-label').text()).toBe('Arquivado');
    expect(wrapper.find('.habit-records').text()).toContain('Histórico de realizações (2)');
    await wrapper.find('button[aria-label="Reativar Caminhar"]').trigger('click');
    expect(store.data.habits[0]!.status).toBe('active');
  });
  it('mantém a navegação mobile e o formulário acessíveis pelo teclado', async () => {
    wrapper = mount(App, { attachTo: document.body });
    await wrapper.find('button[aria-label="Abrir menu"]').trigger('click');
    expect(wrapper.find('.sidebar').classes()).toContain('open');
    await navigate('Hábitos');
    expect(wrapper.find('.sidebar').classes()).not.toContain('open');
    await wrapper.find('.page-heading .primary').trigger('click');
    const editor = wrapper.findComponent(HabitEditor);
    expect(document.activeElement).toBe(editor.find('input').element);
    await editor.find('input').trigger('keydown', { key: 'Escape' });
    await nextTick();
    expect(wrapper.findComponent(HabitEditor).exists()).toBe(false);
  });
});
