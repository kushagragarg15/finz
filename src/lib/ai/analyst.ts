import { monthLabel } from "../finance/pnl";
import type { Workspace } from "../finance/workspace";
import { checkGrounding, type GroundingResult } from "./grounding";
import { groqChat, type ChatMessage, type ToolCall } from "./groq";
import { TOOL_SPECS, collectTxnIds, runTool, toolEvidence } from "./tools";

export interface ToolTrace {
  name: string;
  args: Record<string, unknown>;
  result: unknown;
  /** Transactions behind the figures this call returned (never sent to the model). */
  evidence: string[];
}

export interface AnalystReply {
  answer: string;
  trace: ToolTrace[];
  evidenceTxnIds: string[];
  grounding: GroundingResult;
  varianceIds: string[];
  model: string;
  tokens: number;
}

function systemPrompt(ws: Workspace): string {
  return `You are Finz Analyst, an AI financial analyst reviewing the books of an independent NYC restaurant.
Data: ${ws.ledger.length} bank transactions, ${ws.months.map((m) => monthLabel(m, true)).join(", ")}.

HARD RULES
1. Every number you state MUST come verbatim from a tool result. Never estimate, never do mental arithmetic — use the calculate tool for any sum or difference not already provided.
2. Always call tools before answering a financial question, even if you think you know the answer.
3. Cite the most important 1-6 supporting transactions inline by id in square brackets, e.g. [T1179]. Square brackets are ONLY for transaction ids — never write [January 2026] or [P&L]. Totals need no citation; the app attaches the underlying transactions automatically.
4. If the data cannot answer the question, say so plainly. Do not speculate about data you don't have.
5. Distinguish P&L items from non-P&L items (capex, loan principal, owner distributions, sales tax, gift cards).
5a. The data is bank transactions only. It has no accruals, depreciation, income tax or interest expense, so NEVER present operating profit as net profit, after-tax profit or EBITDA. If asked for those, say they can't be computed from this data, name what's missing, and offer operating profit as the closest figure, clearly labelled as operating profit. Absence of tax or interest payments in the bank does not mean they are zero.
6. When explaining a change, use explain_variance and quote its "breakdown": calendar_timing_effect, one_off_effect and underlying_change are exact and sum to the change. Never add up drivers yourself.
7. Call independent tools in parallel in one step when you can, and never repeat an identical call.
8. When asked to show transactions, fetch them once and summarise the key ones; the app renders the full evidence list, so never paste raw JSON or tool calls.

STYLE
- Lead with the direct answer in one sentence, then 2-5 concise bullets. Use markdown. Format money like $12,345.67.
- Be specific and analytical, like a sharp controller briefing an owner. No filler.`;
}

const MAX_STEPS = 6;

/** Some models emit their own citation markers (e.g. 【tool:0】); strip them. */
const clean = (s: string) => s.replace(/【[^】]*】/g, "").replace(/\p{Cf}/gu, "").trim();
const MAX_TOOL_CHARS = 5000;

function execTools(ws: Workspace, calls: ToolCall[], trace: ToolTrace[], messages: ChatMessage[]) {
  for (const call of calls) {
    let args: Record<string, unknown> = {};
    try { args = JSON.parse(call.function.arguments || "{}"); } catch { /* keep empty */ }
    const seen = trace.find((t) => t.name === call.function.name && JSON.stringify(t.args) === JSON.stringify(args));
    if (seen) {
      messages.push({ role: "tool", tool_call_id: call.id, content: '{"note":"Identical call already made earlier in this conversation turn; reuse that result."}' });
      continue;
    }
    let result: unknown;
    try { result = runTool(ws, call.function.name, args); } catch (e) { result = { error: (e as Error).message }; }
    trace.push({ name: call.function.name, args, result, evidence: toolEvidence(ws, call.function.name, args, result) });
    let content = JSON.stringify(result);
    // Free-tier token budgets are tight; oversized results are cut and the model is told to narrow the query.
    if (content.length > MAX_TOOL_CHARS) content = `${content.slice(0, MAX_TOOL_CHARS)} ...[truncated: narrow the query]`;
    messages.push({ role: "tool", tool_call_id: call.id, content });
  }
}

/** Tool-calling loop. Returns the final text answer (or "" if the step budget ran out). */
async function loop(ws: Workspace, messages: ChatMessage[], trace: ToolTrace[], steps: number): Promise<{ text: string; model: string; tokens: number }> {
  let model = "";
  let tokens = 0;
  for (let step = 0; step < steps; step++) {
    const msg = await groqChat({ messages, tools: TOOL_SPECS, maxTokens: 1500 });
    model = msg.model;
    tokens += msg.tokens;
    if (msg.tool_calls?.length) {
      messages.push({ role: "assistant", content: msg.content ?? null, tool_calls: msg.tool_calls });
      execTools(ws, msg.tool_calls, trace, messages);
      continue;
    }
    return { text: msg.content ?? "", model, tokens };
  }
  return { text: "", model, tokens };
}

export async function runAnalyst(ws: Workspace, history: { role: "user" | "assistant"; content: string }[]): Promise<AnalystReply> {
  const messages: ChatMessage[] = [{ role: "system", content: systemPrompt(ws) }, ...history.slice(-6)];
  const trace: ToolTrace[] = [];

  const first = await loop(ws, messages, trace, MAX_STEPS);
  let answer = clean(first.text) || "I couldn't complete that analysis within the tool-call budget. Try a narrower question.";
  let model = first.model;
  let tokens = first.tokens;

  // Grounding: every figure must trace back to a deterministic tool output.
  let grounding = checkGrounding(answer, trace.map((t) => t.result));
  if (!grounding.verified && trace.length) {
    messages.push({ role: "assistant", content: answer });
    messages.push({
      role: "user",
      content: `VERIFICATION FAILED: these figures do not appear in any tool result: ${grounding.unverified.join(", ")}. Rewrite the answer using only figures that appear in tool results (use the calculate tool if you need arithmetic). Do not mention this verification step.`,
    });
    // Best effort: if the rewrite fails (e.g. rate limit) we keep the answer and show which figures are unverified.
    const retry = await loop(ws, messages, trace, 3).catch(() => null);
    if (retry) tokens += retry.tokens;
    if (retry?.text) {
      const g2 = checkGrounding(retry.text, trace.map((t) => t.result));
      if (g2.unverified.length <= grounding.unverified.length) {
        answer = clean(retry.text);
        grounding = g2;
        model = retry.model;
      }
    }
  }

  const known = new Set(ws.ledger.map((t) => t.id));
  const cited = [...collectTxnIds(answer, known)];
  const fromTools = trace.flatMap((t) => t.evidence);
  const varianceIds = trace
    .map((t) => (t.result as { variance_id?: string })?.variance_id)
    .filter((v): v is string => Boolean(v));

  return {
    answer,
    trace,
    // Cited transactions first, then everything behind the figures the tools returned.
    evidenceTxnIds: [...new Set([...cited, ...fromTools])],
    grounding,
    varianceIds,
    model,
    tokens,
  };
}
