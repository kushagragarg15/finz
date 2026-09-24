"use client";

import { useCallback, useRef, useState } from "react";
import { Check, Loader2, Upload } from "lucide-react";
import { buildWorkspace } from "@/lib/finance/workspace";
import { materialVariances } from "@/lib/finance/variance";
import { useStore } from "@/lib/store";
import { cx } from "@/lib/format";

type StepState = "idle" | "running" | "done" | "warn";
interface Step { label: string; detail: string; state: StepState }

const INITIAL: Step[] = [
  { label: "Ingest", detail: "Read the export and check every row", state: "idle" },
  { label: "Categorize", detail: "Rules and AI label each line on their own, then compare", state: "idle" },
  { label: "Review", detail: "Pull out items that need an accountant's judgment", state: "idle" },
  { label: "Calculate", detail: "Build monthly P&Ls and tie them to the bank", state: "idle" },
  { label: "Explain", detail: "Find the changes that matter and why they happened", state: "idle" },
];

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Real lines from the sample ledger, shown as they appear once reviewed. */
const EXCERPT = [
  { id: "T1119", date: "Mar 8", desc: "POS batch deposit, food sales", cat: "Food Sales", amt: "20,350.64", flag: false },
  { id: "T1164", date: "Mar 15", desc: "Payroll, hourly kitchen and FOH", cat: "Hourly Wages", amt: "−19,455.95", flag: false },
  { id: "T1179", date: "Mar 6", desc: "Large catering event food purchase", cat: "Food Cost", amt: "−6,200.00", flag: true },
  { id: "T1062", date: "Jan 20", desc: "Sales tax remittance, Florida Dept. of Revenue", cat: "Sales Tax (off P&L)", amt: "−6,150.00", flag: true },
];

function TickSvg({ delay, flag }: { delay: number; flag?: boolean }) {
  return flag ? (
    <svg viewBox="0 0 16 16" className="size-4 text-flag" role="img" aria-label="Flagged for review">
      <path d="M4 14V2.5h7.5l-1.6 2.7 1.6 2.8H4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"
        strokeDasharray="24" className="animate-tick" style={{ animationDelay: `${delay}ms` }} />
    </svg>
  ) : (
    <svg viewBox="0 0 16 16" className="size-4 text-pos" role="img" aria-label="Agreed to bank">
      <path d="M2.5 8.5l3.5 3.5 7.5-8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        strokeDasharray="24" className="animate-tick" style={{ animationDelay: `${delay}ms` }} />
    </svg>
  );
}

function Excerpt() {
  return (
    <figure>
      <div className="overflow-hidden rounded-lg border border-rule-strong bg-sheet shadow-[0_1px_0_#c5cad3,0_12px_32px_-16px_rgba(27,34,51,0.25)]">
        <div className="flex items-baseline justify-between gap-3 border-b border-rule px-4 py-2.5 text-xs text-ink-3">
          <span>NYC Restaurant Co., Q1 2026</span>
          <span>Reviewed ledger, extract</span>
        </div>
        <table className="w-full text-sm">
          <tbody>
            {EXCERPT.map((r, i) => (
              <tr key={r.id} className={cx("border-b border-rule last:border-0", r.flag && "bg-flag-wash")}>
                <td className="num whitespace-nowrap py-2.5 pl-4 pr-2 align-top text-xs text-ink-3">{r.date}</td>
                <td className="py-2.5 pr-2 align-top">
                  <span className="block leading-snug">{r.desc}</span>
                  <span className="text-xs text-ink-3">{r.id}, {r.cat}</span>
                </td>
                <td className="num whitespace-nowrap py-2.5 pr-2 text-right align-top">{r.amt}</td>
                <td className="w-8 py-2.5 pr-3 align-top"><TickSvg delay={500 + i * 280} flag={r.flag} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <figcaption className="mt-4 border-l-2 border-ai pl-3 text-sm leading-relaxed text-ai md:ml-auto md:max-w-80">
        T1179 is a one-off. Take it out, along with March&apos;s fifth weekly deposit, and operating profit grew $6,019, not $12,844.
      </figcaption>
    </figure>
  );
}

export default function Landing() {
  const loadWorkspace = useStore((s) => s.loadWorkspace);
  const [steps, setSteps] = useState<Step[]>(INITIAL);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const patch = (i: number, s: Partial<Step>) => setSteps((prev) => prev.map((x, j) => (j === i ? { ...x, ...s } : x)));

  const run = useCallback(async (file: File) => {
    setBusy(true);
    setError(null);
    setSteps(INITIAL);
    try {
      patch(0, { state: "running", detail: `Reading ${file.name}` });
      patch(1, { state: "running" });
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/ingest", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "The file could not be read.");
      patch(0, { state: data.warnings.length ? "warn" : "done", detail: `${data.transactions.length} transactions${data.warnings.length ? `, ${data.warnings.length} rows skipped` : ", no rows skipped"}` });
      const patterns = Object.keys(data.ai).length;
      patch(1, {
        state: data.aiStatus === "ok" ? "done" : "warn",
        detail: data.aiStatus === "ok" ? `${patterns} kinds of transaction labelled and cross-checked` : data.aiStatus === "disabled" ? "AI is off, so rules only. Anything unclear goes to review." : "AI didn't respond, so rules only. Anything unclear goes to review.",
      });

      const input = { raw: data.transactions, ai: data.ai, corrections: [], resolutions: [] };
      const ws = buildWorkspace(input);
      patch(2, { state: "running" });
      await wait(260);
      patch(2, { state: "done", detail: `${ws.review.length} items need a decision` });
      patch(3, { state: "running" });
      await wait(260);
      const ok = ws.pnls.every((p) => p.reconciles);
      patch(3, { state: ok ? "done" : "warn", detail: ok ? `${ws.pnls.length} month${ws.pnls.length > 1 ? "s" : ""}, each tied to the bank to the cent` : "A month does not tie to the bank" });
      patch(4, { state: "running" });
      await wait(260);
      patch(4, { state: "done", detail: `${materialVariances(ws.variances).length} material changes to explain` });
      await wait(650);
      loadWorkspace(input, { fileName: file.name, ingestedAt: new Date().toISOString(), warnings: data.warnings, aiStatus: data.aiStatus, aiError: data.aiError });
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
      setSteps(INITIAL);
    }
  }, [loadWorkspace]);

  const loadSample = async (path: string, name: string) => {
    const res = await fetch(path);
    run(new File([await res.blob()], name));
  };

  return (
    <main
      className="min-h-dvh"
      onDragOver={(e) => { e.preventDefault(); if (!busy) setDrag(true); }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDrag(false); }}
      onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f && !busy) run(f); }}
    >
      {drag && (
        <div className="pointer-events-none fixed inset-3 z-50 grid place-items-center rounded-xl border-2 border-dashed border-ai bg-ai-wash/90 text-lg font-medium text-ai">
          Drop the bank export to start the review
        </div>
      )}

      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <p className="font-cond text-lg font-semibold tracking-tight">Finz Review</p>
        <a href="https://github.com/kushagragarg15/finz" className="text-sm text-ink-2 underline decoration-rule-strong underline-offset-4 hover:text-ink">Source on GitHub</a>
      </header>

      <section className="mx-auto grid max-w-6xl gap-12 px-4 pb-16 pt-6 sm:px-6 md:grid-cols-[1.05fr_1fr] md:gap-16 md:pt-14">
        <div>
          <h1 className="max-w-[16ch] font-cond text-[clamp(2.4rem,6vw,4.1rem)] font-semibold leading-[0.98] tracking-[-0.02em]">
            Close the month with every number tied to the bank.
          </h1>
          <p className="mt-6 max-w-[54ch] text-lg leading-relaxed text-ink-2">
            Upload a bank export. You get a categorized ledger, monthly P&Ls, the changes that matter and why, and a short
            list of items that need your judgment. Ask questions in plain English and every answer points to its transactions.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <button
              onClick={() => loadSample("/sample/nyc-restaurant-transactions.xlsx", "NYC Restaurant Co. - Raw Transactions.xlsx")}
              disabled={busy}
              className="h-12 rounded-md bg-ink px-5 font-medium text-white hover:bg-[#2a3350] disabled:opacity-50"
            >
              Review the sample books
            </button>
            <button
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="inline-flex h-12 items-center gap-2 rounded-md border border-rule-strong bg-sheet px-5 font-medium hover:border-ink-3 disabled:opacity-50"
            >
              <Upload className="size-4" aria-hidden /> Upload a bank export
            </button>
            <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && run(e.target.files[0])} />
          </div>
          <p className="mt-4 text-sm text-ink-3">
            .xlsx or .csv with date, description and amount columns.{" "}
            <button
              onClick={() => loadSample("/sample/messy-bank-export.csv", "messy-bank-export.csv")}
              disabled={busy}
              className="text-ink-2 underline decoration-rule-strong underline-offset-4 hover:text-ink"
            >
              Try a messy export
            </button>{" "}
            to see how it handles ambiguity.
          </p>
          {error && <p role="alert" className="mt-4 max-w-[54ch] rounded-md border border-neg/30 bg-[#fdf0ee] px-3 py-2 text-sm text-neg">{error}</p>}
        </div>

        <div className="md:pt-4">
          <Excerpt />
        </div>
      </section>

      <section aria-labelledby="how-h" className="border-t border-rule bg-sheet">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 md:py-14">
          <h2 id="how-h" className="font-cond text-xl font-semibold">{busy ? "Reviewing your books" : "What happens to your file"}</h2>
          <ol className="mt-6 grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-5" aria-live="polite">
            {steps.map((s, i) => (
              <li key={s.label} className="flex gap-3 lg:block">
                <span
                  className={cx(
                    "grid size-7 shrink-0 place-items-center rounded-full border text-xs font-medium",
                    s.state === "done" && "border-pos bg-pos text-white",
                    s.state === "warn" && "border-flag bg-flag text-white",
                    s.state === "running" && "border-ai text-ai",
                    s.state === "idle" && "border-rule-strong text-ink-2",
                  )}
                >
                  {s.state === "running" ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : s.state === "done" || s.state === "warn" ? <Check className="size-3.5" aria-hidden /> : i + 1}
                </span>
                <div className="lg:mt-3">
                  <p className="font-medium">{s.label}</p>
                  <p className={cx("mt-0.5 text-sm leading-snug", s.state === "warn" ? "text-flag" : "text-ink-2")}>{s.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </main>
  );
}
