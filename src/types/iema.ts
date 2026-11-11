export interface IemaTicket {
  key: string;
  id: number;
  title: string;
  status: { code: number; name: string; label: string };
  priority: string | number | null;
  due_at: string | null;
  updated_at: string | null;
  url: string;
  available: boolean;
  mine: boolean;
  estimate: number | null;
}
export interface IemaData {
  version: 1;
  connectionId: string;
  baseUrl: string;
  enabled: boolean;
  lastSync: string | null;
  tickets: IemaTicket[];
}
