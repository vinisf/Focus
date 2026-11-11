// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { GoogleSheetsClient } from '../src/services/integrations/sheets/GoogleSheetsClient';
import { normalizePlatforms, safeLink } from '../src/services/integrations/sheets/normalization';
import { googleAuth } from '../src/services/integrations/sheets/auth';
import { recommendActivities } from '../src/utils/recommendations';
import { defaultSheetConfig } from '../src/stores/platforms';
import type { SheetConfig, SheetTable } from '../src/types/platforms';
const now = new Date('2026-10-21T12:00:00');
const config = (): SheetConfig => {
  const c = defaultSheetConfig();
  c.mapping.columns = {
    id: 'Código',
    name: 'Sistema',
    status: 'Situação',
    documentation: 'Manual',
    link: 'Site',
    notes: 'Notas',
    owner: 'Pessoa',
    priority: 'Prioridade',
    due: 'Entrega',
  };
  c.mapping.statuses = {
    'a fazer': 'pending',
    fazendo: 'development',
    'aguarda docs': 'documentation',
    finalizada: 'done',
    cancelada: 'cancelled',
    impedida: 'blocked',
  };
  c.mapping.priorities = { urgente: 'urgent', alta: 'high' };
  return c;
};
const headers = [
  'Código',
  'Sistema',
  'Situação',
  'Manual',
  'Site',
  'Notas',
  'Pessoa',
  'Prioridade',
  'Entrega',
];
const row = (id = 'p1', name = 'Synthetic Alpha', status = 'A fazer') => [
  id,
  name,
  status,
  '',
  '',
  '',
  '',
  '',
  '',
];
const table = (rows = [row()]): SheetTable => ({
  title: 'Aba real de teste',
  rows: [[...headers], ...rows],
  links: {},
});
const records = (rows = [row()]) =>
  normalizePlatforms(table(rows), config(), 'account-a', [], now.toISOString());
const meta = {
  sheets: [
    {
      properties: {
        sheetId: 0,
        title: "Test's tab",
        gridProperties: { rowCount: 100, columnCount: 9 },
      },
    },
  ],
};
function grid(rows = [row()]) {
  return {
    sheets: [
      {
        properties: { sheetId: 0, title: "Test's tab" },
        data: [
          {
            rowData: [headers, ...rows].map((r) => ({
              values: r.map((formattedValue) => ({ formattedValue })),
            })),
          },
        ],
      },
    ],
  };
}
function response(data: unknown, status = 200) {
  return { status, text: async () => JSON.stringify(data) } as Response;
}
function fetched(rows = [row()]) {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(response(meta))
    .mockResolvedValueOnce(response(grid(rows)));
}
beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  setActivePinia(createPinia());
});
describe('column mapping and identity', () => {
  it('maps actual named headers independently of positions and preserves original status', () => {
    const t = table();
    t.rows = t.rows.map((r) => [...r].reverse());
    expect(normalizePlatforms(t, config(), 'a', [], now.toISOString())[0]).toMatchObject({
      name: 'Synthetic Alpha',
      originalStatus: 'A fazer',
      status: 'pending',
      row: 2,
      priority: null,
    });
  });
  it('does not assume columns or statuses', () => {
    expect(() =>
      normalizePlatforms(table(), defaultSheetConfig(), 'a', [], now.toISOString()),
    ).toThrow(/Mapeie/);
    const c = config();
    c.mapping.columns.name = 'Not present';
    expect(() => normalizePlatforms(table(), c, 'a', [], now.toISOString())).toThrow(/ausente/);
    expect(records([row('p', 'Alpha', 'Unrecognized')])[0]).toMatchObject({
      status: 'unknown',
      originalStatus: 'Unrecognized',
    });
    expect(records([row('p', 'Alpha', '')])[0]?.status).toBe('unknown');
  });
  it('allows blank optional fields without asserting missing documentation', () => {
    const p = records()[0]!;
    expect(p.documentation).toBeNull();
    expect(p.estimate).toBeNull();
    expect(p.blocked).toBe(false);
    expect(
      recommendActivities({
        tasks: [],
        habits: [],
        completions: [],
        platforms: [p],
        minutes: 30,
        now,
      }).activities,
    ).toEqual([]); // No estimate or concrete next action: do not promise it fits.
  });
  it('rejects duplicate IDs, ambiguous names and duplicate mapped headers', () => {
    expect(() => records([row(), row()])).toThrow(/duplicados/);
    const c = config();
    c.mapping.columns.id = '';
    expect(() =>
      normalizePlatforms(
        table([row('1', 'Alpha'), row('2', ' alpha ')]),
        c,
        'a',
        [],
        now.toISOString(),
      ),
    ).toThrow(/duplicados/);
    const t = table();
    t.rows[0]!.push('Sistema');
    expect(() => normalizePlatforms(t, config(), 'a', [], now.toISOString())).toThrow(/ambígua/);
  });
  it('keeps estimates/notes through row reorders and renames with stable IDs', () => {
    const first = records([row('1', 'Alpha'), row('2', 'Beta')]);
    first[0]!.estimate = 20;
    first[0]!.localNotes = 'local';
    first[0]!.blocked = true;
    first[0]!.progress = 'tested';
    const next = normalizePlatforms(
      table([row('2', 'Beta'), row('1', 'Renamed')]),
      config(),
      'account-a',
      first,
      now.toISOString(),
    );
    expect(next[1]).toMatchObject({
      key: first[0]!.key,
      name: 'Renamed',
      estimate: 20,
      localNotes: 'local',
      blocked: true,
      progress: 'tested',
      row: 3,
    });
  });
  it('uses unique canonical names without IDs and never guesses a rename', () => {
    const c = config();
    c.mapping.columns.id = '';
    const first = normalizePlatforms(
      table([row('1', 'Alpha'), row('2', 'Beta')]),
      c,
      'a',
      [],
      now.toISOString(),
    );
    first[0]!.localNotes = 'private';
    const next = normalizePlatforms(
      table([row('2', 'Beta'), row('1', 'alpha')]),
      c,
      'a',
      first,
      now.toISOString(),
    );
    expect(next[1]?.localNotes).toBe('private');
    expect(
      normalizePlatforms(table([row('1', 'Renamed')]), c, 'a', first, now.toISOString())[0]
        ?.localNotes,
    ).toBe('');
  });
  it('extracts HTTPS hyperlinks and refuses unsafe URLs and invalid dates', () => {
    const t = table();
    t.links['1:3'] = 'https://docs.example.test/reference';
    expect(normalizePlatforms(t, config(), 'a', [], now.toISOString())[0]?.documentation).toBe(
      'https://docs.example.test/reference',
    );
    expect(safeLink('javascript:alert(1)')).toBeNull();
    expect(safeLink('https://user:secret@example.test')).toBeNull();
    const r = row();
    r[8] = '2026-02-30';
    expect(() => records([r])).toThrow(/prazo/);
  });
});
describe('Sheets API and authentication boundaries', () => {
  it('reads the entire chosen gid using readonly GET and Bearer headers', async () => {
    const fetcher = fetched();
    const t = await new GoogleSheetsClient('synthetic-token').read(config().spreadsheetId, 0);
    expect(t.rows[1]?.[1]).toBe('Synthetic Alpha');
    expect(fetcher).toHaveBeenCalledTimes(2);
    const [url, options] = fetcher.mock.calls[1]!;
    expect(new URL(String(url)).searchParams.get('ranges')).toBe("'Test''s tab'");
    expect(String(url)).not.toContain('synthetic-token');
    expect(options).toMatchObject({
      headers: { Authorization: 'Bearer synthetic-token', Accept: 'application/json' },
      redirect: 'error',
      credentials: 'omit',
    });
  });
  it.each([401, 403, 404, 429, 500])(
    'reports HTTP %s without exposing server contents',
    async (status) => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        response({ secret: 'internal detail' }, status),
      );
      await expect(
        new GoogleSheetsClient('fake').read(config().spreadsheetId, 0),
      ).rejects.toMatchObject({ code: String(status) });
    },
  );
  it('blocks absent tokens, unknown tabs and truncated/malformed API responses', async () => {
    await expect(new GoogleSheetsClient('').read(config().spreadsheetId, 0)).rejects.toMatchObject({
      code: 'auth',
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response(meta));
    await expect(
      new GoogleSheetsClient('fake').read(config().spreadsheetId, 123),
    ).rejects.toMatchObject({ code: 'gid' });
    vi.spyOn(globalThis, 'fetch')
      .mockReset()
      .mockResolvedValueOnce(response(meta))
      .mockResolvedValueOnce(response({ sheets: [] }));
    await expect(new GoogleSheetsClient('fake').read(config().spreadsheetId, 0)).rejects.toThrow(
      /incompleta/,
    );
  });
  it('does not fake OAuth in the browser', async () => {
    await expect(googleAuth.authorize()).rejects.toMatchObject({ code: 'setup' });
  });
});
