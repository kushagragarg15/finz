import type { Workspace } from "./workspace";

/**
 * Audit tickmarks, computed per P&L cell from the ledger:
 *   agreed   every figure is built from bank transactions (always true when the cell has any)
 *   footed   the lines of a section add up to its total
 *   flagged  an open review item touches a transaction in the cell
 *   adjusted a reviewer correction changed a transaction in the cell
 */
export interface CellMarks {
  agreed: boolean;
  flagged: number;
  adjusted: boolean;
}

export function markIndex(ws: Workspace) {
  const openItemsByTxn = new Map<string, number>();
  ws.review
    .filter((i) => i.resolution?.status !== "resolved")
    .forEach((i) => i.txnIds.forEach((id) => openItemsByTxn.set(id, (openItemsByTxn.get(id) ?? 0) + 1)));
  const adjusted = new Set(ws.ledger.filter((t) => t.classification.source === "user").map((t) => t.id));

  return (txnIds: string[]): CellMarks => ({
    agreed: txnIds.length > 0,
    flagged: txnIds.reduce((a, id) => a + (openItemsByTxn.get(id) ?? 0), 0),
    adjusted: txnIds.some((id) => adjusted.has(id)),
  });
}

/** Footing check: section lines sum to the section total (to the cent). */
export function foots(lines: { amount: number }[], total: number): boolean {
  return Math.abs(lines.reduce((a, l) => a + l.amount, 0) - total) < 0.005;
}
