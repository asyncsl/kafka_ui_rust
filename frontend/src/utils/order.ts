export const ORDER_STEP = 1024;

export function nextOrderForAppend(siblingOrders: number[]): number {
  if (siblingOrders.length === 0) return ORDER_STEP;
  return Math.max(...siblingOrders) + ORDER_STEP;
}

/** Insert `inserted` between `before` and `after` (each possibly undefined). */
export function orderBetween(
  before: number | undefined,
  after: number | undefined
): number {
  if (before === undefined && after === undefined) return ORDER_STEP;
  if (before === undefined) return (after as number) - ORDER_STEP;
  if (after === undefined) return before + ORDER_STEP;
  return Math.floor((before + after) / 2);
}

/** Returns true when bisection has run out of integer headroom. Caller should re-order siblings. */
export function needsResequence(
  before: number | undefined,
  after: number | undefined
): boolean {
  if (before === undefined || after === undefined) return false;
  return after - before < 2;
}
