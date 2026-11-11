import type { IemaTicket } from '../../../types/iema';
import { IemaApiClient } from './IemaApiClient';
export async function synchronize(
  client: IemaApiClient,
  connection: string,
  previous: IemaTicket[],
): Promise<IemaTicket[]> {
  const available = await client.list('available', connection);
  const mine = await client.list('mine', connection);
  const merged = new Map<string, IemaTicket>();
  for (const ticket of [...available, ...mine]) {
    const existing = merged.get(ticket.key);
    merged.set(ticket.key, {
      ...ticket,
      available: ticket.available || !!existing?.available,
      mine: ticket.mine || !!existing?.mine,
      estimate: previous.find((t) => t.key === ticket.key)?.estimate ?? null,
    });
  }
  return [...merged.values()];
}
