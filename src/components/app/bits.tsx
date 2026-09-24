"use client";

import { Sparkles } from "lucide-react";
import { CATEGORIES, SECTION_LABEL, categoryOf } from "@/lib/finance/chartOfAccounts";
import type { Classification, Section } from "@/lib/finance/types";
import { UNCERTAIN_THRESHOLD } from "@/lib/finance/rules";
import { useStore } from "@/lib/store";
import { cx } from "@/lib/format";

const SECTION_TONE: Record<Section, string> = {
  revenue: "text-teal",
  cogs: "text-paper",
  payroll: "text-paper",
  opex: "text-paper",
  non_pnl: "text-amber",
};

export function CategoryLabel({ id }: { id: string }) {
  const c = categoryOf(id);
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className={SECTION_TONE[c.section]}>{c.name}</span>
      {c.section === "non_pnl" && <span className="text-xs text-amber/80">not P&L</span>}
    </span>
  );
}

export function Confidence({ c }: { c: Classification }) {
  const pctv = Math.round(c.confidence * 100);
  const low = c.source !== "user" && c.confidence < UNCERTAIN_THRESHOLD;
  const sourceLabel = { rule: "Rule", ai: "AI", "rule+ai": "Rule + AI", user: "You" }[c.source];
  return (
    <span className="inline-flex items-center gap-2 text-xs">
      <span className="relative h-1.5 w-12 overflow-hidden rounded-full bg-line" aria-hidden>
        <span className={cx("absolute inset-y-0 left-0 rounded-full", c.source === "user" ? "bg-paper" : low ? "bg-amber" : "bg-teal")} style={{ width: `${pctv}%` }} />
      </span>
      <span className={cx("num w-8", low ? "text-amber" : "text-muted")}>{pctv}%</span>
      <span className={cx(c.source.includes("ai") ? "text-iris" : "text-faint")}>{sourceLabel}</span>
    </span>
  );
}

export function TxnChip({ id }: { id: string }) {
  const openTxns = useStore((s) => s.openTxns);
  return (
    <button
      onClick={() => openTxns([id], id)}
      className="num mx-0.5 inline-flex items-center rounded-md border border-line bg-panel-2 px-1.5 py-0 text-[0.8em] text-paper hover:border-iris"
    >
      {id}
    </button>
  );
}

export function EvidenceButton({ ids, title, children }: { ids: string[]; title: string; children?: React.ReactNode }) {
  const openTxns = useStore((s) => s.openTxns);
  if (!ids.length) return null;
  return (
    <button onClick={() => openTxns(ids, title)} className="text-xs text-muted underline decoration-line underline-offset-4 hover:text-paper hover:decoration-iris">
      {children ?? `${ids.length} transaction${ids.length > 1 ? "s" : ""}`}
    </button>
  );
}

export function CategorySelect({ value, onChange, id }: { value: string; onChange: (v: string) => void; id?: string }) {
  const sections: Section[] = ["revenue", "cogs", "payroll", "opex", "non_pnl"];
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-line bg-ink-2 px-3 py-2 text-sm text-paper focus:border-iris"
    >
      {sections.map((s) => (
        <optgroup key={s} label={SECTION_LABEL[s]}>
          {CATEGORIES.filter((c) => c.section === s).map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

/** Marks AI-authored content. Violet is reserved for anything the model wrote. */
export function AiMark({ label = "AI" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-iris">
      <Sparkles className="size-3" aria-hidden /> {label}
    </span>
  );
}

export function SeverityDot({ s }: { s: "high" | "medium" | "low" }) {
  return <span className={cx("inline-block size-2 shrink-0 rounded-full", s === "high" ? "bg-tomato" : s === "medium" ? "bg-amber" : "bg-muted")} aria-label={`${s} severity`} />;
}
