"use client";

import { Check, Flag, PenLine, Sigma } from "lucide-react";
import { CATEGORIES, SECTION_LABEL, categoryOf } from "@/lib/finance/chartOfAccounts";
import type { CellMarks } from "@/lib/finance/tickmarks";
import type { Classification, Section } from "@/lib/finance/types";
import { UNCERTAIN_THRESHOLD } from "@/lib/finance/rules";
import { useStore } from "@/lib/store";
import { cx } from "@/lib/format";

export function CategoryLabel({ id, compact }: { id: string; compact?: boolean }) {
  const c = categoryOf(id);
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className={c.section === "non_pnl" ? "text-flag" : undefined}>{c.name}</span>
      {c.section === "non_pnl" && !compact && <span className="text-xs text-ink-3">(off P&L)</span>}
    </span>
  );
}

const SOURCE_LABEL = { rule: "Rule", ai: "AI", "rule+ai": "Rule and AI", user: "Reviewer" } as const;

export function Confidence({ c }: { c: Classification }) {
  const p = Math.round(c.confidence * 100);
  const low = c.source !== "user" && c.confidence < UNCERTAIN_THRESHOLD;
  return (
    <span className="inline-flex items-center gap-2 text-xs" title={`${SOURCE_LABEL[c.source]}, ${p}% confidence`}>
      <span className="relative h-1 w-10 overflow-hidden rounded-full bg-rule" aria-hidden>
        <span className={cx("absolute inset-y-0 left-0", c.source === "user" ? "bg-ink" : low ? "bg-flag" : "bg-ink-3")} style={{ width: `${p}%` }} />
      </span>
      <span className={cx("num w-8", low ? "font-medium text-flag" : "text-ink-2")}>{p}%</span>
      <span className={cx("hidden sm:inline", c.source === "ai" || c.source === "rule+ai" ? "text-ai" : "text-ink-3")}>{SOURCE_LABEL[c.source]}</span>
    </span>
  );
}

export function TxnChip({ id }: { id: string }) {
  const openTxns = useStore((s) => s.openTxns);
  return (
    <button
      onClick={() => openTxns([id], id)}
      className="num mx-0.5 inline-flex items-center rounded border border-rule-strong bg-sheet px-1 text-[0.8em] leading-5 text-ink hover:border-ai hover:text-ai"
    >
      {id}
    </button>
  );
}

export function EvidenceButton({ ids, title, children }: { ids: string[]; title: string; children?: React.ReactNode }) {
  const openTxns = useStore((s) => s.openTxns);
  if (!ids.length) return null;
  return (
    <button onClick={() => openTxns(ids, title)} className="text-xs text-ink-2 underline decoration-rule-strong underline-offset-4 hover:text-ai hover:decoration-ai">
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
      className="h-11 w-full rounded-md border border-rule-strong bg-sheet px-3 text-sm text-ink focus:border-ai"
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

/** Label for anything the model wrote. Blue pencil, no sparkles. */
export function AiLabel({ children = "Analyst note" }: { children?: React.ReactNode }) {
  return <span className="text-xs font-medium text-ai">{children}</span>;
}

export function SeverityDot({ s }: { s: "high" | "medium" | "low" }) {
  return (
    <span
      className={cx("inline-block size-2 shrink-0 rounded-full", s === "high" ? "bg-neg" : s === "medium" ? "bg-flag" : "bg-ink-3")}
      role="img"
      aria-label={`${s} severity`}
    />
  );
}

/* ---------- Audit tickmarks ---------- */

export type TickKind = "agreed" | "footed" | "flagged" | "adjusted";

export const TICK_META: Record<TickKind, { label: string; icon: typeof Check; className: string }> = {
  agreed: { label: "Agreed to bank transactions", icon: Check, className: "text-pos" },
  footed: { label: "Footed: lines add up to the total", icon: Sigma, className: "text-ink-3" },
  flagged: { label: "Open review item in this figure", icon: Flag, className: "text-flag" },
  adjusted: { label: "Adjusted by a reviewer", icon: PenLine, className: "text-ink" },
};

export function Tick({ kind, n }: { kind: TickKind; n?: number }) {
  const m = TICK_META[kind];
  const Icon = m.icon;
  return (
    <span className={cx("inline-flex items-center", m.className)} title={n && n > 1 ? `${m.label} (${n})` : m.label}>
      <Icon className="size-3" strokeWidth={2.5} aria-hidden />
      <span className="sr-only">{m.label}</span>
    </span>
  );
}

export function CellTicks({ marks, footed }: { marks: CellMarks; footed?: boolean }) {
  return (
    <span className="inline-flex w-9 items-center justify-start gap-0.5 pl-1">
      {marks.flagged > 0 ? <Tick kind="flagged" n={marks.flagged} /> : marks.agreed && <Tick kind="agreed" />}
      {marks.adjusted && <Tick kind="adjusted" />}
      {footed && <Tick kind="footed" />}
    </span>
  );
}
