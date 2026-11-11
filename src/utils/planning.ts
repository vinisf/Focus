import type { WorkSession } from '../types/planning';
/** Actual elapsed minutes overlapping this local day, including a running session. */
export function workedMinutes(sessions: WorkSession[], now: Date): number {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return sessions.reduce(
    (total, session) =>
      total +
      Math.max(
        0,
        Math.min(session.endedAt ? Date.parse(session.endedAt) : now.getTime(), now.getTime()) -
          Math.max(Date.parse(session.startedAt), start.getTime()),
      ) /
        60000,
    0,
  );
}
