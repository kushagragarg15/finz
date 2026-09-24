import { z } from "zod";
import type { WorkspaceInput } from "../finance/workspace";

const Raw = z.object({
  id: z.string(), date: z.string(), description: z.string(), counterparty: z.string(), amount: z.number(), method: z.string(),
});

export const WorkspaceInputSchema = z.object({
  raw: z.array(Raw).max(20000),
  ai: z.record(z.string(), z.object({ categoryId: z.string(), confidence: z.number(), rationale: z.string() })),
  corrections: z.array(z.object({
    txnId: z.string(), from: z.string(), to: z.string(), note: z.string().optional(), at: z.string(), appliedToPattern: z.string().optional(),
  })),
  resolutions: z.array(z.object({ itemId: z.string(), status: z.enum(["open", "resolved"]), note: z.string(), at: z.string() })),
});

export function parseWorkspaceInput(v: unknown): WorkspaceInput {
  return WorkspaceInputSchema.parse(v);
}

export const errorResponse = (e: unknown, status = 400) =>
  Response.json({ error: e instanceof Error ? e.message : String(e) }, { status });
