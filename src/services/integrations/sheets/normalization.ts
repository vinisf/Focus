import type { Platform, PlatformStatus, SheetConfig, SheetTable } from '../../../types/platforms';
import { platformStatuses } from '../../../types/platforms';
import { SheetsError } from './GoogleSheetsClient';
export const canonical = (value: string) =>
  value.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
export function safeLink(value: string): string | null {
  if (!value.trim()) return null;
  try {
    const u = new URL(value.trim());
    return u.protocol === 'https:' && !u.username && !u.password ? u.href : null;
  } catch {
    return null;
  }
}
export function headersFor(table: SheetTable, row: number): string[] {
  if (!Number.isSafeInteger(row) || row < 1 || !table.rows[row - 1])
    throw new SheetsError('mapping', 'A linha de cabeçalho configurada não foi encontrada.');
  return table.rows[row - 1]!.map((s) => s.trim());
}
export function normalizePlatforms(
  table: SheetTable,
  config: SheetConfig,
  account: string,
  previous: Platform[],
  syncedAt: string,
): Platform[] {
  const { mapping } = config;
  const headers = headersFor(table, mapping.headerRow);
  if (!mapping.columns.name || !mapping.columns.status)
    throw new SheetsError(
      'mapping',
      'Mapeie as colunas de nome e situação usando os cabeçalhos reais.',
    );
  const columns = {} as Record<keyof typeof mapping.columns, number>;
  for (const [field, header] of Object.entries(mapping.columns)) {
    const hits = headers.flatMap((h, i) => (h === header && h !== '' ? [i] : []));
    if (header && hits.length !== 1)
      throw new SheetsError(
        'mapping',
        `A coluna mapeada para ${field} está ausente ou ambígua. Revise o mapeamento.`,
      );
    columns[field as keyof typeof columns] = header ? hits[0]! : -1;
  }
  const seen = new Set<string>();
  const records: Platform[] = [];
  for (let r = mapping.headerRow; r < table.rows.length; r++) {
    const row = table.rows[r]!;
    if (row.every((c) => !c.trim())) continue;
    const cell = (field: keyof typeof columns) => (row[columns[field]] ?? '').trim();
    const name = cell('name');
    const id = cell('id');
    if (!name || (mapping.columns.id && !id))
      throw new SheetsError(
        'identity',
        `Linha ${r + 1} sem nome ou identificador obrigatório. Revise o mapeamento; nada foi substituído.`,
      );
    const identity = mapping.columns.id ? `id:${id}` : `name:${canonical(name)}`;
    if (seen.has(identity))
      throw new SheetsError(
        'identity',
        'Identificadores ou nomes duplicados tornam a reconciliação ambígua. Selecione uma coluna de ID único.',
      );
    seen.add(identity);
    const key = `sheets:${encodeURIComponent(account)}:${config.spreadsheetId}:${config.gid}:${encodeURIComponent(identity)}`;
    const old = previous.find((p) => p.key === key);
    const originalStatus = cell('status');
    const statusKey = canonical(originalStatus);
    const status: PlatformStatus = Object.hasOwn(mapping.statuses, statusKey)
      ? mapping.statuses[statusKey]!
      : 'unknown';
    if (!platformStatuses.includes(status))
      throw new SheetsError('mapping', 'Correspondência de status inválida.');
    const dueDate = cell('due');
    if (
      dueDate &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) ||
        !Number.isFinite(Date.parse(dueDate + 'T12:00:00Z')) ||
        new Date(dueDate + 'T12:00:00Z').toISOString().slice(0, 10) !== dueDate)
    )
      throw new SheetsError(
        'mapping',
        'O prazo mapeado deve usar AAAA-MM-DD. Ajuste o mapeamento, sem modificar a planilha original.',
      );
    const originalPriority = cell('priority');
    const link = (field: 'link' | 'documentation') =>
      safeLink(table.links[`${r}:${columns[field]}`] ?? cell(field));
    records.push({
      key,
      source: 'sheets',
      name,
      originalId: id || null,
      originalStatus,
      status,
      documentation: link('documentation'),
      link: link('link'),
      notes: cell('notes'),
      owner: cell('owner'),
      originalPriority,
      priority: Object.hasOwn(mapping.priorities, canonical(originalPriority))
        ? mapping.priorities[canonical(originalPriority)]!
        : null,
      dueDate: dueDate || null,
      row: r + 1,
      syncedAt,
      estimate: old?.estimate ?? null,
      blocked: old?.blocked ?? false,
      localNotes: old?.localNotes ?? '',
      nextAction: old?.nextAction ?? '',
      progress: old?.progress ?? '',
    });
  }
  return records;
}
