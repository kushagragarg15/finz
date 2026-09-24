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
  classification_uncertain: "Unsure how to categorize",
  unusual_amount: "Unusual amount",
  data_inconsistency: "Doesn't add up",
  non_recurring: "One-off",
  possible_duplicate: "Possible duplicate",
  prepaid_candidate: "Timing",
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
    <li className="px-4 py-4 sm:px-5">
      <div className="flex items-start gap-3">
        <span className="mt-2"><SeverityDot s={item.severity} /></span>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-ink-3">{KIND_LABEL[item.kind]}</p>
          <h3 className={cx("mt-0.5 font-medium leading-snug", resolved && "text-ink-3 line-through decoration-ink-3")}>{item.title}</h3>
          {!resolved ? (
            <>
              <p className="mt-1.5 max-w-[72ch] text-sm text-ink-2">{item.detail}</p>
              <p className="mt-1.5 max-w-[72ch] text-sm"><span className="text-ink-3">Suggested: </span>{item.suggestedAction}</p>
            </>
          ) : (
            item.resolution?.note && <p className="mt-1 text-sm text-ink-2">Decision: {item.resolution.note}</p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            {item.txnIds.length <= 3 ? item.txnIds.map((id) => <TxnChip key={id} id={id} />) : <EvidenceButton ids={item.txnIds} title={item.title} />}
            {!resolved && (
              <>
                {t && alt && (
                  <>
                    <button
                      onClick={() => { correct({ txnId: t.id, from: t.classification.categoryId, to: t.classification.categoryId, note: "Confirmed in review" }); resolve(item.id, `Kept ${categoryOf(t.classification.categoryId).name}`); }}
                      className="h-9 rounded-md border border-rule-strong px-3 text-sm hover:border-ink-3"
                    >
                      Keep {categoryOf(t.classification.categoryId).name}
                    </button>
                    <button
                      onClick={() => { correct({ txnId: t.id, from: t.classification.categoryId, to: alt.categoryId, note: "Chose the other opinion in review" }); resolve(item.id, `Changed to ${categoryOf(alt.categoryId).name}`); }}
                      className="h-9 rounded-md border border-rule-strong px-3 text-sm hover:border-ink-3"
                    >
                      Use {categoryOf(alt.categoryId).name}
                    </button>
                  </>
                )}
                <button onClick={() => ask(`Help me decide how to treat this review item: "${item.title}" (${item.txnIds.slice(0, 5).join(", ")}). What is the evidence and what would you recommend?`)} className="min-h-9 text-sm text-ai hover:underline">
                  Ask the analyst
                </button>
                {!resolving && (
                  <button onClick={() => setResolving(true)} className="min-h-9 text-sm text-ink-2 hover:text-ink">Mark as decided</button>
                )}
              </>
            )}
            {resolved && (
              <button onClick={() => reopen(item.id)} className="inline-flex min-h-9 items-center gap-1 text-sm text-ink-2 hover:text-ink"><RotateCcw className="size-3.5" aria-hidden /> Reopen</button>
            )}
          </div>

          {resolving && !resolved && (
            <form onSubmit={(e) => { e.preventDefault(); resolve(item.id, note || "Reviewed"); setResolving(false); }} className="mt-3 flex flex-wrap items-center gap-2">
              <label htmlFor={`note-${item.id}`} className="sr-only">What did you decide?</label>
              <input id={`note-${item.id}`} autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder="What did you decide?" className="h-10 min-w-0 flex-1 rounded-md border border-rule-strong bg-sheet px-3 text-[16px] placeholder:text-ink-3 sm:max-w-md sm:text-sm" />
              <button className="inline-flex h-10 items-center gap-1 rounded-md bg-ink px-3 text-sm font-medium text-white"><Check className="size-3.5" aria-hidden /> Save decision</button>
              <button type="button" onClick={() => setResolving(false)} className="h-10 px-2 text-sm text-ink-2">Cancel</button>
            </form>
          )}
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
  const total = ws.review.length;
  const high = open.filter((i) => i.severity === "high").length;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-cond text-3xl font-semibold tracking-tight sm:text-4xl">Needs review</h1>
        <p className="mt-1.5 max-w-[68ch] text-ink-2">
          Items the checks can&apos;t settle on their own: treatment that needs judgment, labels the rules and AI are unsure about, amounts out of pattern, and data that doesn&apos;t add up.
        </p>
      </header>

      {total > 0 && (
        <div>
          <div className="flex items-baseline justify-between text-sm">
            <span>{done.length} of {total} decided{high ? `, ${high} high-priority still open` : ""}</span>
            <span className="num text-ink-3">{Math.round((done.length / total) * 100)}%</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-rule" role="progressbar" aria-valuenow={done.length} aria-valuemin={0} aria-valuemax={total} aria-label="Review progress">
            <div className="h-full bg-ink transition-[width] duration-300" style={{ width: `${(done.length / total) * 100}%` }} />
          </div>
        </div>
      )}

      {open.length > 0 ? (
        <ul className="divide-y divide-rule rounded-lg border border-rule-strong bg-sheet">{open.map((i) => <Item key={i.id} item={i} />)}</ul>
      ) : (
        <p className="rounded-lg border border-rule-strong bg-sheet px-5 py-6 text-ink-2">Every item has a decision. The statement is ready to share, and <span className="text-ink">Export .xlsx</span> includes the review log.</p>
      )}

      {done.length > 0 && (
        <section>
          <button onClick={() => setShowResolved(!showResolved)} className="min-h-9 text-sm text-ink-2 hover:text-ink" aria-expanded={showResolved}>
            {showResolved ? "Hide" : "Show"} {done.length} decided item{done.length > 1 ? "s" : ""}
          </button>
          {showResolved && <ul className="mt-2 divide-y divide-rule rounded-lg border border-rule bg-sheet/60">{done.map((i) => <Item key={i.id} item={i} />)}</ul>}
        </section>
      )}
    </div>
  );
}
