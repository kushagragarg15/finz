"use client";

import { useState } from "react";
import { Check, RotateCcw } from "lucide-react";
import { categoryOf } from "@/lib/finance/chartOfAccounts";
import type { ReviewKind } from "@/lib/finance/types";
import type { ReviewItemWithStatus } from "@/lib/finance/workspace";
import { useStore } from "@/lib/store";
import { useWorkspace } from "@/lib/useWorkspace";
import { cx } from "@/lib/format";
import { EvidenceButton, SeverityDot, TxnChip } from "./bits";

const KIND_LABEL: Record<ReviewKind, string> = {
  accounting_treatment: "Accounting treatment",
  classification_uncertain: "Uncertain classification",
  unusual_amount: "Unusual amount",
  data_inconsistency: "Inconsistent data",
  non_recurring: "One-off item",
  possible_duplicate: "Possible duplicate",
  prepaid_candidate: "Timing / prepaid",
};

function Item({ item }: { item: ReviewItemWithStatus }) {
  const ws = useWorkspace()!;
  const resolve = useStore((s) => s.resolve);
  const reopen = useStore((s) => s.reopen);
  const correct = useStore((s) => s.correct);
  const ask = useStore((s) => s.ask);
  const [note, setNote] = useState("");
  const [resolving, setResolving] = useState(false);
  const resolved = item.resolution?.status === "resolved";
  const t = ws.txnById.get(item.txnIds[0]);
  const alt = item.kind === "classification_uncertain" ? t?.classification.alternative : undefined;

  return (
    <li className={cx("rounded-2xl border p-4 md:p-5", resolved ? "border-line/60 bg-transparent" : "border-line bg-panel")}>
      <div className="flex items-start gap-3">
        <span className="mt-2"><SeverityDot s={item.severity} /></span>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted">{KIND_LABEL[item.kind]}</p>
          <h3 className={cx("mt-0.5 font-medium", resolved && "text-muted line-through decoration-faint")}>{item.title}</h3>
          {!resolved && (
            <>
              <p className="mt-2 max-w-[75ch] text-sm text-muted">{item.detail}</p>
              <p className="mt-2 text-sm"><span className="text-faint">Suggested: </span>{item.suggestedAction}</p>
            </>
          )}
          {resolved && item.resolution?.note && <p className="mt-1 text-sm text-muted">Resolved: {item.resolution.note}</p>}

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            {item.txnIds.length <= 3 ? item.txnIds.map((id) => <TxnChip key={id} id={id} />) : <EvidenceButton ids={item.txnIds} title={item.title} />}
            {!resolved && (
              <>
                {t && alt && (
                  <>
                    <button
                      onClick={() => { resolve(item.id, `Kept ${categoryOf(t.classification.categoryId).name}`); correct({ txnId: t.id, from: t.classification.categoryId, to: t.classification.categoryId, note: "Confirmed by reviewer" }); }}
                      className="rounded-lg border border-line px-3 py-1.5 text-sm hover:border-paper/40"
                    >
                      Keep {categoryOf(t.classification.categoryId).name}
                    </button>
                    <button
                      onClick={() => { correct({ txnId: t.id, from: t.classification.categoryId, to: alt.categoryId, note: "Accepted alternative from review queue" }); resolve(item.id, `Reclassified to ${categoryOf(alt.categoryId).name}`); }}
                      className="rounded-lg border border-line px-3 py-1.5 text-sm hover:border-paper/40"
                    >
                      Use {categoryOf(alt.categoryId).name}
                    </button>
                  </>
                )}
                <button onClick={() => ask(`Help me decide how to treat this review item: "${item.title}" (${item.txnIds.slice(0, 5).join(", ")}). What is the evidence and what would you recommend?`)} className="text-sm text-iris hover:underline">
                  Ask analyst
                </button>
                {!resolving ? (
                  <button onClick={() => setResolving(true)} className="text-sm text-muted hover:text-paper">Mark resolved</button>
                ) : (
                  <form
                    onSubmit={(e) => { e.preventDefault(); resolve(item.id, note || "Reviewed"); setResolving(false); }}
                    className="flex w-full flex-wrap items-center gap-2 sm:w-auto"
                  >
                    <label htmlFor={`note-${item.id}`} className="sr-only">Resolution note</label>
                    <input id={`note-${item.id}`} autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder="What did you decide?" className="min-w-56 flex-1 rounded-lg border border-line bg-ink-2 px-3 py-1.5 text-sm placeholder:text-faint" />
                    <button className="inline-flex items-center gap-1 rounded-lg bg-paper px-3 py-1.5 text-sm font-medium text-ink"><Check className="size-3.5" /> Resolve</button>
                  </form>
                )}
              </>
            )}
            {resolved && (
              <button onClick={() => reopen(item.id)} className="inline-flex items-center gap-1 text-sm text-muted hover:text-paper"><RotateCcw className="size-3.5" /> Reopen</button>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

export default function ReviewQueue() {
  const ws = useWorkspace();
  const [showResolved, setShowResolved] = useState(false);
  if (!ws) return null;
  const open = ws.review.filter((i) => i.resolution?.status !== "resolved");
  const done = ws.review.filter((i) => i.resolution?.status === "resolved");
  const high = open.filter((i) => i.severity === "high").length;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Needs review</h1>
        <p className="mt-2 max-w-[70ch] text-muted">
          {open.length ? `${open.length} open item${open.length > 1 ? "s" : ""}${high ? `, ${high} high severity` : ""}.` : "Everything has been reviewed."} These are flagged by deterministic
          rules: non-P&L treatment, low-confidence or disputed classifications, out-of-pattern amounts, inconsistent data and one-offs.
        </p>
      </header>
      {open.length > 0 ? (
        <ul className="space-y-3">{open.map((i) => <Item key={i.id} item={i} />)}</ul>
      ) : (
        <p className="rounded-2xl border border-line p-6 text-muted">No open items. The P&L is ready to share.</p>
      )}
      {done.length > 0 && (
        <section>
          <button onClick={() => setShowResolved(!showResolved)} className="text-sm text-muted hover:text-paper" aria-expanded={showResolved}>
            {showResolved ? "Hide" : "Show"} {done.length} resolved
          </button>
          {showResolved && <ul className="mt-3 space-y-3">{done.map((i) => <Item key={i.id} item={i} />)}</ul>}
        </section>
      )}
    </div>
  );
}
