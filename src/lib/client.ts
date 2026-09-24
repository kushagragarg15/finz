"use client";

import type { AnalystReply } from "./ai/analyst";
import type { WorkspaceInput } from "./finance/workspace";

export async function askAnalyst(workspace: WorkspaceInput, messages: { role: "user" | "assistant"; content: string }[]): Promise<AnalystReply> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspace, messages }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Analyst request failed");
  return data;
}

export async function explainVariance(workspace: WorkspaceInput, varianceId: string): Promise<{ text: string; source: "ai" | "template" }> {
  const res = await fetch("/api/explain", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspace, varianceId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Explain request failed");
  return data;
}

/** Cache key that changes whenever the underlying numbers could change. */
export const dataKey = (w: WorkspaceInput) => `${w.raw.length}:${w.corrections.length}:${w.corrections.at(-1)?.at ?? ""}`;
