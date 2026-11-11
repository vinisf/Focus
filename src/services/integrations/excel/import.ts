import type { Cell, Fill } from 'exceljs';
import type { Platform, PlatformStatus } from '../../../types/platforms';

export type ColorMapping = Record<string, PlatformStatus>;
export const defaultColors: ColorMapping = {
  '#00FF00': 'done',
  none: 'pending',
  '#FFFF00': 'review',
  '#FF0000': 'verify',
};
export interface ImportRow {
  row: number;
  name: string;
  color: string;
  status: PlatformStatus;
  suggestedDiscontinued: boolean;
  included: boolean;
  resolution: '' | 'keep' | 'replace';
  targetKey: string;
}
export const cleanName = (name: string) =>
  name
    .trim()
    .replace(/^\d+\s*(?:[.)\-:–]\s*|\s+)/u, '')
    .trim();
export const normalizedName = (name: string) =>
  cleanName(name)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/\s+/g, ' ');

export function fillColor(fill?: Fill): string {
  if (!fill || (fill.type === 'pattern' && fill.pattern === 'none')) return 'none';
  if (fill.type !== 'pattern' || fill.pattern !== 'solid') return 'unreadable';
  const argb = fill.fgColor?.argb;
  if (argb && /^(?:FF)?[0-9a-f]{6}$/i.test(argb)) return '#' + argb.slice(-6).toUpperCase();
  // Indexed RGB colors are defined by the XLSX standard. Theme/tint is deliberately unknown.
  const indexed: Record<number, string> = {
    2: '#FF0000',
    3: '#00FF00',
    5: '#FFFF00',
    10: '#FF0000',
    11: '#00FF00',
    13: '#FFFF00',
  };
  const index = (fill.fgColor as { indexed?: number } | undefined)?.indexed;
  if (index !== undefined) return indexed[index] ?? 'unreadable';
  return 'unreadable';
}
function literal(cell: Cell): string {
  if (typeof cell.value === 'string') return cell.value.trim();
  if (cell.value && typeof cell.value === 'object' && 'richText' in cell.value)
    return cell.value.richText
      .map((part) => part.text)
      .join('')
      .trim();
  return '';
}
export async function parseExcel(
  bytes: ArrayBuffer,
  mapping: ColorMapping = defaultColors,
  sheetIndex = 1,
  headerRow = 1,
): Promise<ImportRow[]> {
  try {
    if (bytes.byteLength > 10 * 1024 * 1024 || bytes.byteLength < 4) throw new Error();
    const { default: ExcelJS } = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes);
    const sheet = workbook.worksheets[sheetIndex - 1];
    if (
      !sheet ||
      !Number.isSafeInteger(headerRow) ||
      headerRow < 1 ||
      headerRow > sheet.rowCount ||
      sheet.rowCount > 20000 ||
      sheet.columnCount > 200
    )
      throw new Error();
    // Allowlist: only platform names and a discontinuation flag can leave this parser.
    // Never enumerate row values, serialize the workbook or read Login/Senha cells.
    const header = sheet.getRow(headerRow);
    if (
      !['plataforma', 'plataformas', 'sistema'].includes(normalizedName(literal(header.getCell(1))))
    )
      throw new Error();
    const observationColumns: number[] = [];
    header.eachCell((cell, col) => {
      if (['observacao', 'observacoes'].includes(normalizedName(literal(cell))))
        observationColumns.push(col);
    });
    const conditional = (sheet as unknown as { conditionalFormattings?: unknown[] })
      .conditionalFormattings;
    const result: ImportRow[] = [];
    for (let r = headerRow + 1; r <= sheet.rowCount; r++) {
      const cell = sheet.getRow(r).getCell(1);
      const name = cleanName(literal(cell));
      if (!name) {
        if (cell.value !== null) throw new Error();
        continue;
      }
      const color = conditional?.length ? 'unreadable' : fillColor(cell.fill);
      const discontinued = observationColumns.some((col) =>
        /\bdescontinuad[ao]\b/.test(normalizedName(literal(sheet.getRow(r).getCell(col)))),
      );
      result.push({
        row: r,
        name,
        color,
        status: mapping[color] ?? 'unknown',
        suggestedDiscontinued: color === '#FF0000' && discontinued,
        included: mapping[color] === 'pending',
        resolution: '',
        targetKey: '',
      });
    }
    if (!result.length) throw new Error();
    return result;
  } catch {
    // No original library error: it may contain workbook values or filenames.
    throw new Error(
      'Arquivo XLSX inválido, vazio ou fora dos limites (10 MB, 20 mil linhas, 200 colunas). Confira a aba, o cabeçalho e a coluna Plataforma na primeira posição.',
    );
  }
}
export function inspectRows(rows: ImportRow[], platforms: Platform[]) {
  const byName = new Map<string, Platform[]>();
  const counts = new Map<string, number>();
  for (const p of platforms) {
    const name = normalizedName(p.name);
    byName.set(name, [...(byName.get(name) ?? []), p]);
  }
  for (const r of rows)
    if (r.included && r.status === 'pending') {
      const name = normalizedName(r.name);
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  return new Map(
    rows.map((row) => {
      const name = normalizedName(row.name);
      const matches = byName.get(name) ?? [];
      const target = row.targetKey
        ? matches.find((p) => p.key === row.targetKey)
        : matches.length === 1
          ? matches[0]
          : undefined;
      return [
        row,
        {
          matches,
          target,
          duplicate: row.included && row.status === 'pending' && (counts.get(name) ?? 0) > 1,
          ambiguous: matches.length > 1 && !target,
          conflict: !!target && target.status !== row.status,
        },
      ];
    }),
  );
}
export function inspectRow(row: ImportRow, rows: ImportRow[], platforms: Platform[]) {
  return inspectRows(rows, platforms).get(row)!;
}
export function emptyPlatform(name: string, source: Platform['source'] = 'manual'): Platform {
  return {
    key: `platform:${crypto.randomUUID()}`,
    source,
    name: cleanName(name),
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
    row: 1,
    syncedAt: new Date().toISOString(),
    estimate: 30,
    blocked: false,
    localNotes: '',
    nextAction: '',
    progress: '',
    complexity: null,
    archived: false,
    completedDate: null,
    steps: [],
  };
}
export function mergeImport(platforms: Platform[], rows: ImportRow[]): Platform[] {
  const result = platforms.map((p) => ({ ...p }));
  const states = inspectRows(rows, platforms);
  const byKey = new Map(result.map((p) => [p.key, p]));
  for (const row of rows.filter((r) => r.included && r.status === 'pending')) {
    const state = states.get(row)!;
    if (state.duplicate || state.ambiguous || (state.conflict && !row.resolution))
      throw new Error(
        'Resolva os status desconhecidos, duplicatas e conflitos antes de confirmar.',
      );
    if (state.target) {
      if (row.resolution !== 'keep') {
        const target = byKey.get(state.target.key)!;
        target.status = row.status;
        // All Focus fields, identity, archive state and completion date are preserved.
      }
    } else result.push({ ...emptyPlatform(row.name, 'excel'), status: row.status, row: row.row });
  }
  return result;
}
