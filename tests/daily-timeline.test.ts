// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import DailyTimeline from '../src/components/DailyTimeline.vue';
import { dailyTimeline } from '../src/utils/dailyTimeline';
import { emptyLifePlanning, LIFE_PLANNING_KEY } from '../src/services/lifePlanningRepository';
import { useLifePlanning } from '../src/stores/lifePlanning';
import type { WeeklyBlock } from '../src/types/lifePlanning';
import { emptyImportOptions } from '../src/services/personalPlanImport';
let wrapper: VueWrapper;
const block = (id: string, fields: Partial<WeeklyBlock> = {}): WeeklyBlock => ({
  id,
  title: id,
  date: '2026-11-11',
  kind: 'fixed',
  start: '10:00',
  end: '11:00',
  goalId: '',
  status: 'planned',
  ...fields,
});
beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
});
afterEach(() => {
  wrapper?.unmount();
  vi.restoreAllMocks();
});
it('orders only active blocks for the day and separates flexible blocks without inventing times', () => {
  const data = {
    ...emptyLifePlanning(),
    blocks: [
      block('later', { start: '14:00', end: '15:00' }),
      block('earlier'),
      block('cancelled', { status: 'cancelled' }),
      block('tomorrow', { date: '2026-11-12' }),
      block('flexible', { kind: 'flexible', start: '', end: '' }),
    ],
  };
  const original = JSON.stringify(data);
  const result = dailyTimeline(data, '2026-11-11');
  expect(result.timed.map((b) => b.id)).toEqual(['earlier', 'later']);
  expect(result.flexible.map((b) => b.id)).toEqual(['flexible']);
  expect(JSON.stringify(data)).toBe(original);
});
it('shows confirmation versus suggestion, descriptions and timezone at the local day boundary', () => {
  const store = useLifePlanning();
  store.saveBlock(block('Compromisso de exemplo', { description: 'Descrição opcional' }));
  store.saveBlock(block('Sugestão de exemplo', { kind: 'flexible', start: '12:00', end: '13:00' }));
  store.saveBlock(block('Sem horário de exemplo', { kind: 'flexible', start: '', end: '' }));
  wrapper = mount(DailyTimeline, { props: { now: new Date('2026-11-12T01:30:00Z') } });
  expect(wrapper.text()).toContain('Data: 2026-11-11');
  expect(wrapper.text()).toContain('America/Fortaleza');
  expect(wrapper.get('.timeline-fixed').text()).toContain('Compromisso confirmado');
  expect(wrapper.text()).toContain('Descrição opcional');
  expect(wrapper.get('.timeline-list li:not(.timeline-fixed)').text()).toContain(
    'Sugestão flexível',
  );
  expect(wrapper.get('.timeline-flexible').text()).toContain('Sem horário de exemplo');
  expect(wrapper.get('.timeline-flexible').find('time').exists()).toBe(false);
});
it('supports manual editing with the shared editor and preserves the old block when times conflict', async () => {
  const store = useLifePlanning();
  store.saveBlock(block('Primeiro bloco'));
  store.saveBlock(block('Segundo bloco', { start: '11:00', end: '12:00' }));
  wrapper = mount(DailyTimeline, { props: { now: new Date('2026-11-11T15:00:00Z') } });
  await wrapper
    .findAll('button')
    .find((b) => b.text() === 'Editar / replanejar Segundo bloco')!
    .trigger('click');
  await wrapper.get('form input[type=time]').setValue('10:30');
  await wrapper.get('form').trigger('submit');
  expect(wrapper.find('form').exists()).toBe(true);
  expect(store.data.blocks[1]!.start).toBe('11:00');
  expect(wrapper.get('form [role=alert]').text()).toContain('conflito');
  await wrapper.get('form input[type=date]').setValue('2026-11-12');
  await wrapper.get('form').trigger('submit');
  expect(wrapper.find('form').exists()).toBe(false);
  expect(wrapper.get('.timeline-list').text()).not.toContain('Segundo bloco');
  const saved = JSON.parse(localStorage.getItem(LIFE_PLANNING_KEY)!);
  expect(saved.blocks[1].date).toBe('2026-11-12');
  await wrapper.get('input[type=date]').setValue('2026-11-12');
  expect(wrapper.get('.timeline-list').text()).toContain('Segundo bloco');
});
it('tracks today across timezone midnight and renders a useful empty state without writes', async () => {
  const write = vi.spyOn(Storage.prototype, 'setItem');
  wrapper = mount(DailyTimeline, { props: { now: new Date('2026-11-12T01:30:00Z') } });
  expect(wrapper.text()).toContain('2026-11-11');
  expect(wrapper.text()).toContain('Nenhum bloco com horário');
  await wrapper.setProps({ now: new Date('2026-11-12T04:00:00Z') });
  expect(wrapper.text()).toContain('2026-11-12');
  expect(write).not.toHaveBeenCalled();
});
it('refreshes an already mounted timeline after an additive import', async () => {
  const store = useLifePlanning();
  wrapper = mount(DailyTimeline, { props: { now: new Date('2026-11-11T15:00:00Z') } });
  expect(wrapper.findAll('.timeline-list li')).toHaveLength(0);
  expect(
    store.importPlan(
      { ...emptyLifePlanning(), blocks: [block('Bloco importado de exemplo')] },
      emptyImportOptions(),
      emptyLifePlanning(),
      true,
    ),
  ).toBe(true);
  await flushPromises();
  expect(wrapper.get('.timeline-list').text()).toContain('Bloco importado de exemplo');
});
