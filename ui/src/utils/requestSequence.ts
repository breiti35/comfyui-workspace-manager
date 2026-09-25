/**
 * Guards against stale async responses overwriting newer state. On the slow
 * RunPod proxy responses routinely arrive out of order: a request started
 * before a newer one (or before a websocket push delivered fresher data) can
 * resolve last and would otherwise win.
 *
 * Usage:
 *   const ticket = guard.begin();
 *   const data = await fetchSomething();
 *   if (!guard.isCurrent(ticket)) return; // a newer request/push won
 *
 * `notePush()` records data that arrived through another channel (e.g. the
 * model_list websocket event); every request begun before it becomes stale.
 * Pure, no dependencies (tested in tests/frontend/requestSequence.test.ts).
 */
export interface SequenceTicket {
  readonly request: number;
  readonly push: number;
}

export interface SequenceGuard {
  begin(): SequenceTicket;
  notePush(): void;
  isCurrent(ticket: SequenceTicket): boolean;
  /** Makes every outstanding ticket stale (e.g. on unmount). */
  invalidate(): void;
}

export function createSequenceGuard(): SequenceGuard {
  let latestRequest = 0;
  let pushCount = 0;
  return {
    begin() {
      latestRequest += 1;
      return { request: latestRequest, push: pushCount };
    },
    notePush() {
      pushCount += 1;
    },
    isCurrent(ticket) {
      return ticket.request === latestRequest && ticket.push === pushCount;
    },
    invalidate() {
      latestRequest += 1;
    },
  };
}
