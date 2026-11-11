// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ExcelJS from 'exceljs';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { useTasks } from '../src/stores/tasks';
import {
  cleanName,
  emptyPlatform,
  fillColor,
  inspectRow,
  mergeImport,
  parseExcel,
} from '../src/services/integrations/excel/import';
import type { ImportRow } from '../src/services/integrations/excel/import';
import type { Platform } from '../src/types/platforms';
import { PlatformRepository, PLATFORMS_KEY } from '../src/services/platformRepository';
import { SheetsRepository, SHEETS_KEY } from '../src/services/integrations/sheets/repository';
import { normalizePlatforms } from '../src/services/integrations/sheets/normalization';
import { defaultSheetConfig, usePlatforms } from '../src/stores/platforms';
import { usePlanning } from '../src/stores/planning';
import { workedMinutes } from '../src/utils/planning';
import { recommendActivities } from '../src/utils/recommendations';
import type { RecommendationContext } from '../src/types/recommendations';
import PlatformsPanel from '../src/components/PlatformsPanel.vue';
import PlatformCard from '../src/components/PlatformCard.vue';
import FocusView from '../src/views/FocusView.vue';

const now = new Date('2026-10-22T12:00:00');
const candidate = (name = 'Alpha', status: Platform['status'] = 'pending'): ImportRow => ({
  row: 2,
  name,
  status,
  color: 'none',
  suggestedDiscontinued: false,
  included: true,
  resolution: '',
  targetKey: '',
});
const context = (
  platforms: Platform[],
  overrides: Partial<RecommendationContext> = {},
): RecommendationContext => ({
  now,
  minutes: 30,
  tasks: [],
  habits: [],
  completions: [],
  platforms,
  ...overrides,
});
const actionable = (name = 'Alpha'): Platform => ({
  ...emptyPlatform(name),
  nextAction: 'Testar payload',
  estimate: 20,
});
async function fixture(configure?: (sheet: ExcelJS.Worksheet) => void) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Dados');
  sheet.addRow(['Plataforma', 'Login', 'Senha', 'COD?', 'Observação']);
  sheet.addRow(['1. Alpha', 'secret-login', 'secret-password', 'secret-code', 'secret-note']);
  configure?.(sheet);
  const bytes = await workbook.xlsx.writeBuffer();
  return new Uint8Array(bytes).buffer;
}
beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  setActivePinia(createPinia());
});

describe('importação XLSX local', () => {
  it.each([
    ['FF00FF00', 'done'],
    ['FFFFFF00', 'review'],
    ['FFFF0000', 'verify'],
    ['FF123456', 'unknown'],
  ])('lê preenchimento %s como %s', async (argb, status) => {
    const rows = await parseExcel(
      await fixture((s) => {
        s.getCell('A2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
      }),
    );
    expect(rows[0]).toMatchObject({ name: 'Alpha', status });
  });
  it('distingue ausência de preenchimento, branco explícito, temas e gradientes', async () => {
    expect((await parseExcel(await fixture()))[0]?.status).toBe('pending');
    expect(fillColor({ type: 'pattern', pattern: 'none' })).toBe('none');
    expect(fillColor({ type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } })).toBe(
      '#FFFFFF',
    );
    expect(fillColor({ type: 'pattern', pattern: 'solid', fgColor: { theme: 4 } })).toBe(
      'unreadable',
    );
    expect(fillColor({ type: 'gradient', gradient: 'angle', degree: 0, stops: [] })).toBe(
      'unreadable',
    );
  });
  it('não presume a cor produzida por formatação condicional', async () => {
    const rows = await parseExcel(
      await fixture((s) =>
        s.addConditionalFormatting({
          ref: 'A2',
          rules: [
            {
              type: 'expression',
              formulae: ['1=1'],
              priority: 1,
              style: { fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00FF00' } } },
            },
          ],
        }),
      ),
    );
    expect(rows[0]?.status).toBe('unknown');
  });
  it('aceita cores configuradas explicitamente', async () => {
    const rows = await parseExcel(
      await fixture((s) => {
        s.getCell('A2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF123456' } };
      }),
      { '#123456': 'analysis' },
    );
    expect(rows[0]?.status).toBe('analysis');
  });
  it.each(['1. Alpha', '02) Alpha', '3 - Alpha', '4: Alpha', '5 Alpha'])(
    'remove numeração em %s',
    (name) => expect(cleanName(name)).toBe('Alpha'),
  );
  it('preserva nomes sem numeração', () => expect(cleanName('123Pay')).toBe('123Pay'));
  it('descarta credenciais, observações e códigos antes da prévia e persistência, sem rede ou logs', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch');
    const logger = vi.spyOn(console, 'log');
    const rows = await parseExcel(await fixture());
    const store = usePlatforms();
    expect(store.importRows(rows)).toBe(true);
    const serialized = JSON.stringify(rows) + localStorage.getItem(PLATFORMS_KEY);
    for (const secret of [
      'secret-login',
      'secret-password',
      'secret-code',
      'secret-note',
      'Login',
      'Senha',
    ])
      expect(serialized).not.toContain(secret);
    expect(fetcher).not.toHaveBeenCalled();
    expect(logger).not.toHaveBeenCalled();
  });
  it('sugere descontinuada sem substituir automaticamente o status vermelho', async () => {
    const rows = await parseExcel(
      await fixture((s) => {
        s.getCell('A2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF0000' } };
        s.getCell('E2').value = 'Plataforma descontinuada; secret-note';
      }),
    );
    expect(rows[0]).toMatchObject({ status: 'verify', suggestedDiscontinued: true });
    expect(JSON.stringify(rows)).not.toContain('secret-note');
  });
  it('recusa arquivos inválidos, cabeçalhos inseguros, aba ausente e fórmulas sem expor conteúdo', async () => {
    await expect(parseExcel(new TextEncoder().encode('secret-password').buffer)).rejects.toThrow(
      'Arquivo XLSX inválido',
    );
    await expect(
      parseExcel(
        await fixture((s) => {
          s.getCell('A1').value = 'Login';
        }),
      ),
    ).rejects.toThrow('Arquivo XLSX inválido');
    await expect(parseExcel(await fixture(), undefined, 2)).rejects.toThrow(
      'Arquivo XLSX inválido',
    );
    await expect(
      parseExcel(
        await fixture((s) => {
          s.getCell('A2').value = { formula: 'SECRET()', result: 'secret-password' };
        }),
      ),
    ).rejects.toThrow('Arquivo XLSX inválido');
  });
});

describe('reconciliação e dados locais', () => {
  it('importa somente pendentes mesmo se outros status estiverem selecionados', () => {
    const statuses: Platform['status'][] = [
      'pending',
      'done',
      'cancelled',
      'review',
      'verify',
      'discontinued',
      'unknown',
      'analysis',
      'development',
      'blocked',
      'documentation',
    ];
    const existing = { ...emptyPlatform('done'), status: 'done' as const, estimate: 45 };
    const result = mergeImport(
      [existing],
      statuses.map((status) => candidate(status, status)),
    );
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(existing);
    expect(result[1]).toMatchObject({ name: 'pending', status: 'pending', estimate: 30 });
  });
  it('usa 30 minutos como padrão e preserva estimativas personalizadas na reimportação', () => {
    const store = usePlatforms();
    store.create('Manual');
    expect(store.data.platforms[0]?.estimate).toBe(30);
    expect(store.importRows([candidate('Excel')])).toBe(true);
    const excel = store.data.platforms.find((p) => p.name === 'Excel')!;
    expect(excel.estimate).toBe(30);
    store.update(excel.key, { estimate: 60 });
    store.importRows([candidate('Excel')]);
    expect(store.data.platforms.find((p) => p.key === excel.key)?.estimate).toBe(60);
  });
  it('preserva a ausência de estimativa e valores já informados', () => {
    new PlatformRepository().save([
      { ...emptyPlatform('Sem estimativa'), estimate: null },
      { ...emptyPlatform('Personalizada'), estimate: 45 },
    ]);
    expect(new PlatformRepository().load().map((p) => p.estimate)).toEqual([null, 45]);
  });
  it('reimporta por nome normalizado, mantém identidade e não duplica', () => {
    const first = mergeImport([], [candidate('ÁLPHA')]);
    const second = mergeImport(first, [candidate('2. alpha')]);
    expect(second).toHaveLength(1);
    expect(second[0]?.key).toBe(first[0]?.key);
  });
  it('exige decisão para diferenças e preserva campos locais e registros ausentes', () => {
    const p = {
      ...actionable(),
      status: 'development' as const,
      localNotes: 'Minhas notas',
      complexity: 'high' as const,
      progress: 'Progresso',
      archived: true,
      steps: [{ id: 's', title: 'Validar', done: true }],
    };
    const absent = emptyPlatform('Outra');
    const row = candidate('Alpha');
    expect(() => mergeImport([p, absent], [row])).toThrow('conflitos');
    row.resolution = 'keep';
    expect(mergeImport([p, absent], [row])).toEqual([p, absent]);
    row.resolution = 'replace';
    expect(mergeImport([p, absent], [row])).toEqual([{ ...p, status: 'pending' }, absent]);
    expect(p.status).toBe('development');
  });
  it('impede duplicatas e permite excluir uma linha', () => {
    const rows = [candidate('Alpha'), { ...candidate('2. ALPHA'), row: 3 }];
    expect(inspectRow(rows[0]!, rows, []).duplicate).toBe(true);
    expect(() => mergeImport([], rows)).toThrow();
    rows[1]!.included = false;
    expect(mergeImport([], rows)).toHaveLength(1);
  });
  it('solicita identidade explícita se registros legados têm o mesmo nome', () => {
    const platforms = [
      emptyPlatform('Alpha'),
      { ...emptyPlatform('ALPHA'), status: 'done' as const },
    ];
    const row = candidate('Alpha');
    expect(() => mergeImport(platforms, [row])).toThrow();
    row.targetKey = platforms[1]!.key;
    row.resolution = 'replace';
    expect(mergeImport(platforms, [row]).map((p) => p.status)).toEqual(['pending', 'pending']);
  });
  it('bloqueia status desconhecido até correção explícita', () => {
    const row = candidate('Alpha', 'unknown');
    expect(mergeImport([], [row])).toEqual([]);
    row.status = 'pending';
    expect(mergeImport([], [row])[0]?.status).toBe('pending');
  });
  it('migra Sheets sem apagar o cache antigo ou mudar a identidade', () => {
    const config = defaultSheetConfig();
    config.mapping.columns.name = 'Plataforma';
    config.mapping.columns.status = 'Status';
    const platforms = normalizePlatforms(
      {
        title: '',
        rows: [
          ['Plataforma', 'Status'],
          ['Alpha', ''],
        ],
        links: {},
      },
      config,
      'legacy',
      [],
      now.toISOString(),
    );
    new SheetsRepository().save({
      version: 1,
      enabled: false,
      config,
      platforms,
      accountId: 'legacy',
      lastSync: null,
      headers: [],
    });
    const original = localStorage.getItem(SHEETS_KEY);
    const store = usePlatforms();
    expect(store.data.platforms).toEqual(platforms);
    expect(store.importRows([{ ...candidate(), resolution: 'replace' }])).toBe(true);
    expect(store.data.platforms[0]?.key).toBe(platforms[0]?.key);
    expect(localStorage.getItem(SHEETS_KEY)).toBe(original);
  });
  it('bloqueia gravações em cache corrompido e mantém os demais dados intactos', () => {
    localStorage.setItem(PLATFORMS_KEY, '{broken');
    localStorage.setItem('focus.integrations.iema.v1', 'unchanged');
    localStorage.setItem('focus.v1', 'personal');
    localStorage.setItem('focus.habits.v1', 'habits');
    const store = usePlatforms();
    expect(store.blocked).toBe(true);
    expect(store.create('Alpha')).toBe(false);
    expect(localStorage.getItem(PLATFORMS_KEY)).toBe('{broken');
    expect(localStorage.getItem('focus.integrations.iema.v1')).toBe('unchanged');
    expect(localStorage.getItem('focus.v1')).toBe('personal');
    expect(localStorage.getItem('focus.habits.v1')).toBe('habits');
  });
  it('valida cadastro, permite arquivar e usa allowlist na persistência', () => {
    const store = usePlatforms();
    expect(store.create('Alpha')).toBe(true);
    expect(store.create('ALPHA')).toBe(false);
    const p = store.data.platforms[0]!;
    expect(store.update(p.key, { estimate: -1 })).toBe(false);
    expect(store.update(p.key, { documentation: 'javascript:alert(1)' })).toBe(false);
    expect(store.update(p.key, { completedDate: '2026-02-30' })).toBe(false);
    expect(store.update(p.key, { archived: true, localNotes: 'Local' })).toBe(true);
    expect(store.recommendations).toEqual([]);
    expect(new PlatformRepository().load()[0]?.localNotes).toBe('Local');
    new PlatformRepository().save([{ ...p, password: 'secret-password' } as Platform]);
    expect(localStorage.getItem(PLATFORMS_KEY)).not.toContain('secret-password');
  });
  it('falha de escrita não modifica o estado em memória', () => {
    const store = usePlatforms();
    store.create('Alpha');
    const snapshot = JSON.stringify(store.data);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(store.importRows([candidate('Beta')])).toBe(false);
    expect(JSON.stringify(store.data)).toBe(snapshot);
  });
  it('recusa sobrescrever alterações de outra sessão silenciosamente', () => {
    const a = new PlatformRepository();
    const b = new PlatformRepository();
    a.load();
    b.load();
    a.save([emptyPlatform('Outra sessão')]);
    expect(() => b.save([emptyPlatform('Registro antigo')])).toThrow('outra sessão');
    expect(new PlatformRepository().load()[0]?.name).toBe('Outra sessão');
  });
});

describe('recomendações e sessões profissionais', () => {
  it('recomenda ação concreta e respeita tempo, complexidade e importância informados', () => {
    const simple = { ...actionable('Simples'), complexity: 'low' as const };
    const complex = { ...actionable('Complexa'), complexity: 'high' as const };
    expect(recommendActivities(context([complex, simple])).activities[0]?.title).toContain(
      'Simples: Testar payload',
    );
    expect(
      recommendActivities(context([{ ...complex, priority: 'high' }, simple])).activities[0]?.title,
    ).toContain('Complexa');
    expect(recommendActivities(context([simple], { minutes: 10 })).activities).toEqual([]);
  });
  it.each([
    'done',
    'cancelled',
    'discontinued',
    'unknown',
    'verify',
    'blocked',
    'documentation',
  ] as const)('não sugere %s', (status) => {
    expect(recommendActivities(context([{ ...actionable(), status }])).activities).toEqual([]);
  });
  it('não inventa duração ou ações e exclui bloqueios e arquivamento', () => {
    for (const fields of [{ nextAction: '' }, { blocked: true }, { archived: true }])
      expect(recommendActivities(context([{ ...actionable(), ...fields }])).activities).toEqual([]);
    const result = recommendActivities(context([actionable()]));
    expect(result.activities[0]?.reason).toContain('Complexidade não informada');
    const unknown = recommendActivities(context([{ ...actionable(), estimate: null }]));
    expect(unknown.activities[0]?.duration).toBeNull();
    expect(unknown.activities[0]?.reason).toContain('Duração desconhecida');
  });
  it('mantém filtros de origem, exclusões, pausa e limite diário', () => {
    const platforms = [actionable()];
    expect(recommendActivities(context(platforms, { filter: 'iema' })).activities).toEqual([]);
    expect(recommendActivities(context(platforms, { filter: 'platform' })).activities).toHaveLength(
      1,
    );
    const preferences = usePlanning().data.preferences;
    expect(
      recommendActivities(
        context(platforms, { preferences: { ...preferences, excludedSources: ['platform'] } }),
      ).activities,
    ).toEqual([]);
    expect(
      recommendActivities(
        context(platforms, { preferences: { ...preferences, restUntil: now.getTime() + 1000 } }),
      ).activities,
    ).toEqual([]);
    expect(
      recommendActivities(
        context(platforms, {
          preferences: { ...preferences, maxWorkMinutes: 30 },
          workMinutes: 15,
        }),
      ).activities,
    ).toEqual([]);
  });
  it('registra tempo efetivo sem concluir plataforma ou criar tarefa', () => {
    const store = usePlatforms();
    store.create('Alpha');
    const planning = usePlanning();
    const key = store.data.platforms[0]!.key;
    expect(planning.start(key, 'platform', now, 20)).toBe(true);
    expect(planning.start('other', 'platform', now, 10)).toBe(false);
    expect(workedMinutes(planning.data.sessions, new Date(now.getTime() + 600000))).toBe(10);
    expect(store.data.platforms[0]?.status).toBe('pending');
    expect(localStorage.getItem('focus.v1')).toBeNull();
  });
  it('preserva sessão em andamento ao reiniciar e respeita o orçamento explícito', () => {
    const planning = usePlanning();
    planning.preferences({ maxWorkMinutes: 30 });
    expect(planning.start('unknown', 'platform', now)).toBe(false);
    expect(planning.start('long', 'platform', now, 60)).toBe(false);
    expect(planning.start('fit', 'platform', now, 20)).toBe(true);
    setActivePinia(createPinia());
    const reloaded = usePlanning();
    expect(reloaded.running?.key).toBe('fit');
    expect(reloaded.stop(new Date(now.getTime() + 1200000))).toBe(true);
    expect(workedMinutes(reloaded.data.sessions, new Date(now.getTime() + 1800000))).toBe(20);
    expect(reloaded.start('too-long', 'platform', new Date(now.getTime() + 1800000), 15)).toBe(
      false,
    );
  });
  it('conta somente a parte da sessão que pertence ao dia local', () => {
    const previous = new Date(2026, 9, 21, 23, 50);
    const current = new Date(2026, 9, 22, 0, 10);
    expect(
      workedMinutes(
        [
          {
            id: 's',
            key: 'p',
            source: 'platform',
            startedAt: previous.toISOString(),
            endedAt: null,
          },
        ],
        current,
      ),
    ).toBe(10);
    localStorage.setItem('focus.planning.v1', '{broken');
    expect(usePlanning().blocked).toBe(true);
    expect(usePlanning().start('p', 'platform', now, 10)).toBe(false);
    expect(localStorage.getItem('focus.planning.v1')).toBe('{broken');
  });
  it('muitas plataformas não ultrapassam uma tarefa pessoal urgente', () => {
    const tasks: RecommendationContext['tasks'] = [
      {
        id: 't',
        title: 'Entrega pessoal',
        description: '',
        categoryId: 'c',
        dueDate: '',
        plannedDate: '',
        time: '',
        priority: 'urgent',
        importance: 'high',
        duration: 20,
        status: 'pending',
        createdAt: now.toISOString(),
        completedAt: null,
        recurrence: null,
      },
    ];
    expect(
      recommendActivities(
        context(
          Array.from({ length: 100 }, (_, i) => actionable(`Plataforma ${i}`)),
          { tasks },
        ),
      ).activities[0]?.type,
    ).toBe('task');
  });
});

describe('interface de plataformas', () => {
  it('pede confirmação, permite voltar e apaga todas as plataformas de forma persistente', async () => {
    const store = usePlatforms();
    store.create('Alpha');
    store.create('Arquivada');
    store.update(store.data.platforms[1]!.key, { archived: true });
    localStorage.setItem('focus.v1', 'personal');
    localStorage.setItem('focus.habits.v1', 'habits');
    localStorage.setItem('focus.integrations.iema.v1', 'iema');
    const wrapper = mount(PlatformsPanel, { props: { mode: 'settings' } });
    const remove = () =>
      wrapper
        .findAll('button')
        .find((b) => b.text() === 'Apagar todas as integrações de plataformas')!;
    await remove().trigger('click');
    expect(store.data.platforms).toHaveLength(2);
    expect(wrapper.text()).toContain('incluindo arquivadas, anotações e etapas');
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Voltar')!
      .trigger('click');
    expect(wrapper.text()).not.toContain('Confirmar exclusão');
    expect(store.data.platforms).toHaveLength(2);
    await remove().trigger('click');
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Confirmar exclusão')!
      .trigger('click');
    expect(store.data.platforms).toEqual([]);
    expect(store.recommendations).toEqual([]);
    expect(new PlatformRepository().load()).toEqual([]);
    expect(localStorage.getItem('focus.v1')).toBe('personal');
    expect(localStorage.getItem('focus.habits.v1')).toBe('habits');
    expect(localStorage.getItem('focus.integrations.iema.v1')).toBe('iema');
    expect(wrapper.text()).toContain('Todas as integrações de plataformas foram apagadas.');
    wrapper.unmount();
  });
  it('preserva plataformas se o armazenamento impedir a exclusão', () => {
    const store = usePlatforms();
    store.create('Alpha');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(store.clearAll()).toBe(false);
    expect(store.data.platforms).toHaveLength(1);
    expect(new PlatformRepository().load()).toHaveLength(1);
  });
  it('exige encerrar a sessão profissional antes de apagar as plataformas', () => {
    const store = usePlatforms();
    store.create('Alpha');
    const planning = usePlanning();
    planning.start(store.data.platforms[0]!.key, 'platform', now, 30);
    expect(store.clearAll()).toBe(false);
    expect(store.data.platforms).toHaveLength(1);
    expect(planning.running).toBeDefined();
    planning.stop(now);
    expect(store.clearAll()).toBe(true);
    expect(planning.data.sessions).toHaveLength(1);
  });
  it('oferece importação e cadastro sem controles Google ou conexão de rede', () => {
    const fetcher = vi.spyOn(globalThis, 'fetch');
    const wrapper = mount(PlatformsPanel, { props: { mode: 'settings' } });
    expect(wrapper.find('input[type="file"]').attributes('accept')).toContain('.xlsx');
    expect(wrapper.text()).toContain('Cadastrar manualmente');
    expect(wrapper.text()).not.toContain('Sincronizar planilha');
    expect(wrapper.text()).not.toContain('Conectar Google');
    expect(fetcher).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it('ignora status desconhecidos sem adicionar tarefas automaticamente', async () => {
    const bytes = await fixture((s) => {
      s.getCell('A2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF123456' } };
    });
    const wrapper = mount(PlatformsPanel, { props: { mode: 'list' } });
    const input = wrapper.find('input[type="file"]');
    Object.defineProperty(input.element, 'files', {
      value: [{ name: 'fixture.xlsx', size: bytes.byteLength, arrayBuffer: async () => bytes }],
    });
    await input.trigger('change');
    await vi.waitFor(() => expect(wrapper.text()).toContain('1 ignoradas por status'));
    expect(useTasks().data.tasks).toEqual([]);
    expect(wrapper.text()).not.toContain('secret-password');
    wrapper.unmount();
  });
  it('anexar a planilha cria tarefas pendentes diretamente', async () => {
    const bytes = await fixture();
    const wrapper = mount(PlatformsPanel, { props: { mode: 'settings' } });
    const input = wrapper.find('input[type="file"]');
    Object.defineProperty(input.element, 'files', {
      value: [{ name: 'fixture.xlsx', size: bytes.byteLength, arrayBuffer: async () => bytes }],
    });
    await input.trigger('change');
    await vi.waitFor(() => expect(wrapper.text()).toContain('1 tarefas adicionadas'));
    expect(useTasks().data.tasks[0]).toMatchObject({
      title: 'Integrar Alpha',
      duration: 30,
      dueDate: '',
      plannedDate: '',
    });
    expect(usePlatforms().data.platforms).toEqual([]);
    wrapper.unmount();
  });
  it('cadastra sem tarefas e adiciona etapas opcionais ainda não concluídas', async () => {
    const store = usePlatforms();
    store.create('Alpha');
    const wrapper = mount(PlatformCard, { props: { platform: store.data.platforms[0]! } });
    expect(store.data.platforms[0]?.steps).toEqual([]);
    const button = wrapper.findAll('button').find((b) => b.text().startsWith('Adicionar:'))!;
    await button.trigger('click');
    expect(store.data.platforms[0]?.steps?.[0]?.done).toBe(false);
    expect(localStorage.getItem('focus.v1')).toBeNull();
    wrapper.unmount();
  });
  it('mantém a inicial limpa e concentra integrações em Configurações', async () => {
    const wrapper = mount(FocusView);
    const main = wrapper.find('main');
    expect(main.text()).toContain('Minha Única Coisa');
    expect(main.text()).not.toContain('Integrações de Plataformas');
    expect(main.text()).not.toContain('Suporte IEMA');
    expect(main.find('input[type="file"]').exists()).toBe(false);
    await wrapper
      .findAll('nav button')
      .find((b) => b.text().includes('Configurações'))!
      .trigger('click');
    expect(wrapper.find('main').text()).toContain('Integrações de Plataformas');
    expect(wrapper.find('input[type="file"]').exists()).toBe(true);
    wrapper.unmount();
  });
  it('não exporta plataformas, anotações ou sessões profissionais no backup pessoal', async () => {
    const platforms = usePlatforms();
    platforms.create('Plataforma confidencial');
    const p = platforms.data.platforms[0]!;
    platforms.update(p.key, { localNotes: 'Nota profissional' });
    usePlanning().start(p.key, 'platform', now, 20);
    let exported: Blob | undefined;
    const create = URL.createObjectURL;
    const revoke = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn((blob: Blob) => {
      exported = blob;
      return 'blob:test';
    });
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const wrapper = mount(FocusView);
    try {
      await wrapper.get('button.profile').trigger('click');
      const text = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsText(exported!);
      });
      expect(Object.keys(JSON.parse(text)).sort()).toEqual([
        'habits',
        'performanceHistory',
        'routine',
        'tasks',
        'version',
      ]);
      for (const value of [p.key, 'Plataforma confidencial', 'Nota profissional'])
        expect(text).not.toContain(value);
    } finally {
      wrapper.unmount();
      URL.createObjectURL = create;
      URL.revokeObjectURL = revoke;
    }
  });
});
