"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, TriangleAlert } from "lucide-react";
import type { AnalystReply } from "@/lib/ai/analyst";
import { useStore } from "@/lib/store";
import { EvidenceButton, TxnChip } from "./bits";

const TOOL_LABEL: Record<string, string> = {
  briefing_facts: "Assembled figures",
  get_pnl: "Read P&L",
  get_metric_trend: "Metric trend",
  explain_variance: "Variance analysis",
  search_transactions: "Searched transactions",
  get_review_items: "Review queue",
  get_top_changes: "Ranked changes",
  calculate: "Calculated",
  list_categories: "Chart of accounts",
};

export function Markdown({ text }: { text: string }) {
  // Turn transaction citations ([T1234], [T1234, T1235], bare T1234) into clickable evidence chips.
  const linked = text
    .replace(/\p{Cf}/gu, "")
    .replace(/\[((?:\s*T\d{3,}\s*[,;]?)+)\]/g, (_, ids: string) => ids.match(/T\d{3,}/g)!.map((id) => `[${id}](#txn-${id})`).join(" "))
    .replace(/(?<![[#-])\b(T\d{4})\b(?!\])/g, "[$1](#txn-$1)");
  return (
    <div className="ai-prose text-[0.95rem]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) =>
            href?.startsWith("#txn-") ? <TxnChip id={href.slice(5)} /> : <a href={href} className="underline">{children}</a>,
        }}
      >
        {linked}
      </ReactMarkdown>
    </div>
  );
}

export function Grounding({ reply }: { reply: Omit<AnalystReply, "answer"> }) {
  const g = reply.grounding;
  if (!g.checked) return <span className="text-xs text-ink-3">No figures to check</span>;
  return g.verified ? (
    <span className="inline-flex items-center gap-1 text-xs text-pos" title="Every figure in this answer matches a value computed from the ledger.">
      <Check className="size-3.5" strokeWidth={2.5} aria-hidden /> {g.checked} figure{g.checked > 1 ? "s" : ""} checked against the ledger
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs text-flag" title="These figures don't match anything computed from the ledger. Don't rely on them.">
      <TriangleAlert className="size-3.5" aria-hidden /> Not in the ledger: {g.unverified.join(", ")}
    </span>
  );
}

export function Trace({ reply }: { reply: Omit<AnalystReply, "answer"> }) {
  const focusVariance = useStore((s) => s.focusVariance);
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
      <Grounding reply={reply} />
      <EvidenceButton ids={reply.evidenceTxnIds} title="Transactions behind this answer">
        {reply.evidenceTxnIds.length} transaction{reply.evidenceTxnIds.length === 1 ? "" : "s"} behind this
      </EvidenceButton>
      {reply.varianceIds.slice(0, 1).map((id) => (
        <button key={id} onClick={() => focusVariance(id)} className="text-xs text-ink-2 underline decoration-rule-strong underline-offset-4 hover:text-ai">
          Open the change
        </button>
      ))}
      {reply.trace.length > 0 && (
        <details className="w-full text-xs text-ink-3">
          <summary className="cursor-pointer select-none hover:text-ink-2">
            How this was worked out ({reply.trace.length} lookup{reply.trace.length > 1 ? "s" : ""}{reply.model ? `, ${reply.model.split("/").pop()}` : ""})
          </summary>
          <ol className="mt-2 space-y-2">
            {reply.trace.map((t, i) => (
              <li key={i} className="rounded-md border border-rule bg-sheet-2 p-2">
                <p className="text-ink-2">{TOOL_LABEL[t.name] ?? t.name} <code className="break-all text-ink-3">{JSON.stringify(t.args)}</code></p>
                <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all text-[11px] text-ink-3">{JSON.stringify(t.result, null, 1).slice(0, 2500)}</pre>
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}
