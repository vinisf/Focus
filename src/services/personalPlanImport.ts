import type { Goal, LifeArea, LifePlanningData, WeeklyBlock } from '../types/lifePlanning';
import { blocksCollide, validateLifePlanning } from './lifePlanningRepository';

export const PERSONAL_PLAN_LIMIT = 5 * 1024 * 1024;
export type ImportChoice = 'keep' | 'update' | 'duplicate' | 'skip';
export type ImportKind = 'areas' | 'goals' | 'blocks';
type Entry = LifeArea | Goal | WeeklyBlock;
export interface ImportOptions {
  choices: Partial<Record<string, ImportChoice>>;
  adjustments: Partial<Record<string, Pick<WeeklyBlock, 'date' | 'kind' | 'start' | 'end'>>>;
  timezone: '' | 'keep' | 'incoming';
}
export interface ImportEntry {
  key: string;
  kind: ImportKind;
  incoming: Entry;
  existing?: Entry;
  outcome: 'new' | 'identical' | 'conflict' | 'kept' | 'updated' | 'duplicated' | 'skipped';
}
export interface ImportPreview {
  data: LifePlanningData;
  entries: ImportEntry[];
  collisions: { first: WeeklyBlock; second: WeeklyBlock }[];
  issues: string[];
  changed: boolean;
}
export const importKey = (kind: ImportKind, id: string) => `${kind}:${id}`;
export const emptyImportOptions = (): ImportOptions => ({
  choices: {},
  adjustments: {},
  timezone: '',
});
// Compare object content independently of JSON property order; do not log private records.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => JSON.stringify(k) + ':' + canonical(v))
        .join(',') +
      '}'
    );
  return JSON.stringify(value) ?? '';
}
export const samePlan = (a: unknown, b: unknown) => canonical(a) === canonical(b);
export function parsePersonalPlan(raw: string): LifePlanningData {
  if (new Blob([raw]).size > PERSONAL_PLAN_LIMIT) throw Error('O plano deve ter no máximo 5 MB.');
  try {
    const d = JSON.parse(raw);
    if (
      !Array.isArray(d?.areas) ||
      d.areas.length > 200 ||
      !Array.isArray(d.goals) ||
      d.goals.length > 1000 ||
      !Array.isArray(d.blocks) ||
      d.blocks.length > 1000 ||
      d.goals.reduce(
        (n: number, g: Goal) => n + (Array.isArray(g?.milestones) ? g.milestones.length : 0),
        0,
      ) > 10000
    )
      throw Error();
    validateLifePlanning(d);
    return d;
  } catch {
    throw Error(
      'Plano inválido ou incompatível. Use LifePlanningData versão 1, com IDs únicos, referências válidas e horários sem conflito. Blocos que cruzam a meia-noite precisam ser divididos. O backup focus-full deve ser restaurado em Configurações.',
    );
  }
}
export function previewPersonalPlan(
  current: LifePlanningData,
  incoming: LifePlanningData,
  options: ImportOptions,
): ImportPreview {
  validateLifePlanning(current);
  validateLifePlanning(incoming);
  const data = JSON.parse(JSON.stringify(current)) as LifePlanningData;
  const entries: ImportEntry[] = [];
  const issues: string[] = [];
  const areaIds = new Map<string, string>();
  const goalIds = new Map<string, string>();
  function merge<T extends Entry>(
    kind: ImportKind,
    source: T[],
    target: T[],
    mapping: Map<string, string>,
    transform: (record: T) => T,
    copy: (record: T, id: string) => T,
  ) {
    for (const raw of source) {
      const record = transform(JSON.parse(JSON.stringify(raw)) as T);
      const existing = target.find((r) => r.id === raw.id);
      const key = importKey(kind, raw.id);
      const choice = options.choices[key];
      let outcome: ImportEntry['outcome'];
      if (kind === 'blocks' && choice === 'skip') {
        outcome = 'skipped';
      } else if (!existing) {
        target.push(record);
        mapping.set(raw.id, record.id);
        outcome = 'new';
      } else if (samePlan(record, existing)) {
        mapping.set(raw.id, existing.id);
        outcome = 'identical';
      } else if (choice === 'duplicate') {
        // Stable candidate IDs make repeated imports with the same decisions idempotent.
        let n = 1;
        let candidate: T;
        let match: T | undefined;
        do {
          candidate = copy(record, `${raw.id.slice(0, 170)}~import-${n++}`);
          match = target.find((r) => r.id === candidate.id);
        } while (
          source.some((s) => s.id === candidate.id) ||
          [...mapping.values()].includes(candidate.id) ||
          (match && !samePlan(match, candidate))
        );
        if (!match) target.push(candidate);
        mapping.set(raw.id, candidate.id);
        outcome = match ? 'identical' : 'duplicated';
      } else if (choice === 'update') {
        target[target.findIndex((r) => r.id === raw.id)] = record;
        mapping.set(raw.id, raw.id);
        outcome = 'updated';
      } else {
        mapping.set(raw.id, raw.id);
        outcome = choice === 'keep' ? 'kept' : 'conflict';
        if (outcome === 'conflict')
          issues.push('Escolha como tratar cada ID com conteúdo diferente.');
      }
      entries.push({ key, kind, incoming: record, existing, outcome });
    }
  }
  merge(
    'areas',
    incoming.areas,
    data.areas,
    areaIds,
    (a) => a,
    (a, id) => ({ ...a, id }),
  );
  merge(
    'goals',
    incoming.goals,
    data.goals,
    goalIds,
    (g) => ({ ...g, areaId: areaIds.get(g.areaId)! }),
    (g, id) => {
      const reserved = new Set(g.milestones.map((m) => m.id));
      return {
        ...g,
        id,
        milestones: g.milestones.map((m, index) => {
          let n = index + 1;
          let mapped: string;
          do {
            mapped = `${id.slice(0, 150)}:${id.slice(-20)}:marco:${n++}`;
          } while (reserved.has(mapped));
          reserved.add(mapped);
          return { ...m, id: mapped };
        }),
      };
    },
  );
  merge(
    'blocks',
    incoming.blocks,
    data.blocks,
    new Map(),
    (b) => ({
      ...b,
      ...options.adjustments[importKey('blocks', b.id)],
      goalId: b.goalId ? goalIds.get(b.goalId)! : '',
    }),
    (b, id) => ({ ...b, id }),
  );
  if (current.timezone !== incoming.timezone) {
    if (!['keep', 'incoming'].includes(options.timezone))
      issues.push('Escolha qual fuso usar. Datas e horários não serão convertidos.');
    if (options.timezone === 'incoming') data.timezone = incoming.timezone;
  }
  const collisions: ImportPreview['collisions'] = [];
  for (let i = 0; i < data.blocks.length; i++)
    for (let j = i + 1; j < data.blocks.length; j++) {
      if (blocksCollide(data.blocks[i]!, data.blocks[j]!))
        collisions.push({ first: data.blocks[i]!, second: data.blocks[j]! });
    }
  if (collisions.length)
    issues.push('Ajuste os blocos em conflito ou ignore os blocos importados.');
  try {
    validateLifePlanning(data);
  } catch {
    if (!collisions.length)
      issues.push(
        'Confira as datas e os horários ajustados. Para blocos sem horário, limpe início e fim e use o tipo flexível.',
      );
  }
  return {
    data,
    entries,
    collisions,
    issues: [...new Set(issues)],
    changed: !samePlan(current, data),
  };
}
