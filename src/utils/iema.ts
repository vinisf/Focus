import type { IemaTicket } from '../types/iema';

/** Same in-service/assigned status group already used by the IEMA interface. */
export function isMyActiveTicket(ticket: IemaTicket): boolean {
  return ticket.mine && [2, 5, 6].includes(ticket.status.code);
}
