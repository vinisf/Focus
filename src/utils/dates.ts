export function dateKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function addDays(value: string, days: number): string {
  const d = new Date(value + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return dateKey(d);
}
export function displayDate(value: string): string {
  return value
    ? new Date(value + 'T12:00:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })
    : 'Sem prazo';
}
