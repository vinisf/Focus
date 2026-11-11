export const platformStatuses = [
  'pending',
  'analysis',
  'development',
  'documentation',
  'blocked',
  'done',
  'cancelled',
  'review',
  'verify',
  'discontinued',
  'unknown',
] as const;
export type PlatformStatus = (typeof platformStatuses)[number];
export const platformStatusLabels: Record<PlatformStatus, string> = {
  pending: 'Pendente',
  analysis: 'Em análise',
  development: 'Em desenvolvimento',
  documentation: 'Aguardando documentação',
  blocked: 'Bloqueada',
  done: 'Concluída',
  cancelled: 'Cancelada',
  review: 'A revisar',
  verify: 'Verificar situação',
  discontinued: 'Descontinuada',
  unknown: 'Status não identificado',
};
export interface SheetMapping {
  headerRow: number;
  columns: {
    id: string;
    name: string;
    status: string;
    documentation: string;
    link: string;
    notes: string;
    owner: string;
    priority: string;
    due: string;
  };
  statuses: Record<string, PlatformStatus>;
  priorities: Record<string, 'low' | 'medium' | 'high' | 'urgent'>;
}
export interface SheetConfig {
  spreadsheetId: string;
  gid: number;
  mapping: SheetMapping;
}
export interface Platform {
  key: string;
  source: 'sheets' | 'excel' | 'manual';
  complexity?: 'low' | 'medium' | 'high' | null;
  archived?: boolean;
  completedDate?: string | null;
  steps?: { id: string; title: string; done: boolean }[];
  name: string;
  originalId: string | null;
  originalStatus: string;
  status: PlatformStatus;
  documentation: string | null;
  link: string | null;
  notes: string;
  owner: string;
  originalPriority: string;
  priority: 'low' | 'medium' | 'high' | 'urgent' | null;
  dueDate: string | null;
  row: number;
  syncedAt: string;
  estimate: number | null;
  blocked: boolean;
  localNotes: string;
  nextAction: string;
  progress: string;
}
export interface SheetsData {
  version: 1;
  config: SheetConfig;
  accountId: string | null;
  enabled: boolean;
  lastSync: string | null;
  platforms: Platform[];
  headers: string[];
}
export interface SheetTable {
  title: string;
  rows: string[][];
  links: Record<string, string>;
}
export const suggestedActions = [
  'Verificar documentação da API',
  'Identificar eventos de webhook',
  'Mapear status',
  'Implementar a integração',
  'Preparar payload de teste',
  'Validar recebimento de postback',
];
