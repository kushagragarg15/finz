"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ShieldCheck, ShieldAlert } from "lucide-react";
import type { AnalystReply } from "@/lib/ai/analyst";
import { useStore } from "@/lib/store";
import { EvidenceButton, TxnChip } from "./bits";

const TOOL_LABEL: Record<string, string> = {
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
  // Turn [T1234] citations into links we render as clickable evidence chips.
  const linked = text.replace(/\[(T\d{3,})\]/g, "[$1](#txn-$1)").replace(/(?<![[#-])\b(T\d{4})\b(?!\])/g, "[$1](#txn-$1)");
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
  if (!g.checked) return <span className="text-xs text-faint">No figures to verify</span>;
  return g.verified ? (
    <span className="inline-flex items-center gap-1 text-xs text-teal" title="Every figure in this answer matches a value returned by the deterministic finance engine.">
      <ShieldCheck className="size-3.5" aria-hidden /> {g.checked} figures verified against ledger
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs text-amber" title="These figures could not be matched to engine output. Treat them with caution.">
      <ShieldAlert className="size-3.5" aria-hidden /> Unverified: {g.unverified.join(", ")}
    </span>
  );
}

export function Trace({ reply }: { reply: Omit<AnalystReply, "answer"> }) {
  const focusVariance = useStore((s) => s.focusVariance);
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
      <Grounding reply={reply} />
      <EvidenceButton ids={reply.evidenceTxnIds} title="Evidence for this answer">
        Traced to {reply.evidenceTxnIds.length} transaction{reply.evidenceTxnIds.length === 1 ? "" : "s"}
      </EvidenceButton>
      {reply.varianceIds.slice(0, 2).map((id) => (
        <button key={id} onClick={() => focusVariance(id)} className="text-xs text-muted underline decoration-line underline-offset-4 hover:text-paper">
          Open variance
        </button>
      ))}
      {reply.trace.length > 0 && (
        <details className="w-full text-xs text-faint">
          <summary className="cursor-pointer hover:text-muted">How this was computed ({reply.trace.length} tool call{reply.trace.length > 1 ? "s" : ""})</summary>
          <ol className="mt-2 space-y-2">
            {reply.trace.map((t, i) => (
              <li key={i} className="rounded-lg border border-line bg-ink-2 p-2">
                <p className="text-muted">{TOOL_LABEL[t.name] ?? t.name} <code className="text-faint">{JSON.stringify(t.args)}</code></p>
                <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all text-[11px] text-faint">{JSON.stringify(t.result, null, 1).slice(0, 2500)}</pre>
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}
