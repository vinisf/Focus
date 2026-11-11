import { isHabitPreferredTime } from './recommendations';
import type { ActivityRecommendation } from '../types/recommendations';
import { dateKey } from './dates';

export function dayGreeting(now: Date) {
  const hour = now.getHours();
  if (hour < 12)
    return { title: 'Bom dia', message: 'Vamos organizar seu dia com calma.', period: 'morning' };
  if (hour < 18)
    return {
      title: 'Boa tarde',
      message: 'Seu próximo passo pode ser simples.',
      period: 'afternoon',
    };
  return {
    title: 'Boa noite',
    message: 'Vamos encerrar o dia no seu ritmo.',
    period: 'evening',
  };
}

/** Presentation copy only: eligibility, estimates and priority remain in the recommendation engine. */
export function nextActionReason(
  activity: ActivityRecommendation,
  now: Date,
  minutes: number,
): string {
  if (activity.type === 'routine') return activity.reason;
  if (activity.type === 'task') {
    const task = activity.task;
    if (task.mandatory && task.scheduledTime && (task.plannedDate || task.dueDate) === dateKey(now))
      return activity.reason;
    if (task.dueDate && task.dueDate <= dateKey(now)) return activity.reason;
    if (task.status === 'active') return 'Você já começou. Que tal continuar de onde parou?';
    if (task.plannedDate === dateKey(now))
      return 'Você planejou essa tarefa para hoje. Pode ser um bom próximo passo.';
    if (task.dueDate && task.dueDate < dateKey(now))
      return 'Essa tarefa ficou para depois. Você pode retomá-la com calma.';
    if (task.dueDate === dateKey(now))
      return 'Essa tarefa vence hoje e a estimativa cabe no tempo que você reservou.';
    if (task.integrationName)
      return `Uma integração de cada vez. A estimativa cabe nos seus ${minutes} minutos.`;
    return `Você reservou ${minutes} minutos. Esta é uma opção para avançar com calma.`;
  }
  if (activity.type === 'habit')
    return activity.reason.includes('meta semanal')
      ? activity.reason
      : isHabitPreferredTime(activity.habit, now)
        ? 'Este é um bom momento para o hábito que você planejou.'
        : 'Um pequeno espaço para uma prática que você escolheu cultivar.';
  if (activity.type === 'iema')
    return activity.ticket.mine
      ? 'Este chamado está com você. Que tal avaliar o próximo passo?'
      : 'Há um chamado disponível para você avaliar com calma.';
  return activity.platform.nextAction;
}
