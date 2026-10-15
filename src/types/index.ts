export type Status = 'pending' | 'active' | 'done' | 'cancelled';
export type Priority = 'low' | 'medium' | 'high' | 'urgent';
export interface Recurrence {
  kind: 'daily' | 'weekly' | 'custom';
  days: number[];
}
export interface Task {
  id: string;
  title: string;
  description: string;
  categoryId: string;
  dueDate: string;
  time: string;
  plannedDate: string;
  priority: Priority;
  importance: 'low' | 'medium' | 'high';
  duration: number;
  status: Status;
  createdAt: string;
  completedAt: string | null;
  recurrence: Recurrence | null;
  nextId?: string;
}
export interface Category {
  id: string;
  name: string;
  color: string;
}
export interface Data {
  version: 1;
  tasks: Task[];
  categories: Category[];
}
