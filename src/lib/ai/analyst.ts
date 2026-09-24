import { monthLabel } from "../finance/pnl";
import type { Workspace } from "../finance/workspace";
import { checkGrounding, type GroundingResult } from "./grounding";
import { groqChat, type ChatMessage } from "./groq";
import { TOOL_SPECS, collectTxnIds, runTool } from "./tools";

export interface ToolTrace {
  name: string;
  args: Record<string, unknown>;
  result: unknown;
}

export interface AnalystReply {
  answer: string;
  trace: ToolTrace[];
  evidenceTxnIds: string[];
  grounding: GroundingResult;
  varianceIds: string[];
}

function systemPrompt(ws: Workspace): string {
  return `You are Finz Analyst, an AI financial analyst reviewing the books of an independent NYC restaurant.
Data: ${ws.ledger.length} bank transactions, ${ws.months.map((m) => monthLabel(m, true)).join(", ")}.

HARD RULES
1. Every number you state MUST come verbatim from a tool result. Never estimate, never do mental arithmetic — use the calculate tool for any sum or difference not already provided.
2. Always call tools before answering a financial question, even if you think you know the answer.
3. Cite supporting transactions inline using their ids in square brackets, e.g. [T1179]. Cite the most important 1-6 ids, not all.
4. If the data cannot answer the question, say so plainly. Do not speculate about data you don't have.
5. Distinguish P&L items from non-P&L items (capex, loan principal, owner distributions, sales tax, gift cards).
6. When explaining a change, separate calendar/timing effects and one-offs (see "context" in explain_variance) from underlying trading performance.

STYLE
- Lead with the direct answer in one sentence, then 2-5 concise bullets. Use markdown. Format money like $12,345.67.
- Be specific and analytical, like a sharp controller briefing an owner. No filler.`;
}

const MAX_STEPS = 6;

export async function runAnalyst(ws: Workspace, history: { role: "user" | "assistant"; content: string }[]): Promise<AnalystReply> {
  const messages: ChatMessage[] = [{ role: "system", content: systemPrompt(ws) }, ...history.slice(-8)];
  const trace: ToolTrace[] = [];

  let answer = "";
  for (let step = 0; step < MAX_STEPS; step++) {
    const msg = await groqChat({ messages, tools: TOOL_SPECS, maxTokens: 1500 });
    if (msg.tool_calls?.length) {
      messages.push({ role: "assistant", content: msg.content ?? null, tool_calls: msg.tool_calls });
      for (const call of msg.tool_calls) {
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(call.function.arguments || "{}"); } catch { /* keep empty */ }
        let result: unknown;
        try { result = runTool(ws, call.function.name, args); } catch (e) { result = { error: (e as Error).message }; }
        trace.push({ name: call.function.name, args, result });
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result).slice(0, 12000) });
      }
      continue;
    }
    answer = msg.content ?? "";
    break;
  }
  if (!answer) answer = "I couldn't complete that analysis within the tool-call budget. Try a narrower question.";

  // Grounding: every figure must trace back to a deterministic tool output.
  let grounding = checkGrounding(answer, trace.map((t) => t.result));
  if (!grounding.verified && trace.length) {
    messages.push({ role: "assistant", content: answer });
    messages.push({
      role: "user",
      content: `VERIFICATION FAILED: these figures do not appear in any tool result: ${grounding.unverified.join(", ")}. Rewrite the answer using only figures that appear in tool results (use the calculate tool if you need arithmetic). Do not mention this verification step.`,
    });
    for (let step = 0; step < 3; step++) {
      const retry = await groqChat({ messages, tools: TOOL_SPECS, maxTokens: 1500 });
      if (retry.tool_calls?.length) {
        messages.push({ role: "assistant", content: retry.content ?? null, tool_calls: retry.tool_calls });
        for (const call of retry.tool_calls) {
          let args: Record<string, unknown> = {};
          try { args = JSON.parse(call.function.arguments || "{}"); } catch { /* ignore */ }
          let result: unknown;
          try { result = runTool(ws, call.function.name, args); } catch (e) { result = { error: (e as Error).message }; }
          trace.push({ name: call.function.name, args, result });
          messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result).slice(0, 12000) });
        }
        continue;
      }
      if (retry.content) {
        const g2 = checkGrounding(retry.content, trace.map((t) => t.result));
        if (g2.unverified.length <= grounding.unverified.length) { answer = retry.content; grounding = g2; }
      }
      break;
    }
  }

  const known = new Set(ws.ledger.map((t) => t.id));
  const cited = [...collectTxnIds(answer, known)];
  const fromTools = [...collectTxnIds(trace.map((t) => t.result), known)];
  const varianceIds = trace
    .map((t) => (t.result as { variance_id?: string })?.variance_id)
    .filter((v): v is string => Boolean(v));

  return {
    answer,
    trace,
    evidenceTxnIds: cited.length ? cited : fromTools.slice(0, 30),
    grounding,
    varianceIds,
  };
}
