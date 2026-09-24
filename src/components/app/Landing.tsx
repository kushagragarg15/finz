"use client";

import { useCallback, useRef, useState } from "react";
import { Check, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import Aurora from "@/components/reactbits/Aurora";
import BlurText from "@/components/reactbits/BlurText";
import StarBorder from "@/components/reactbits/StarBorder";
import { buildWorkspace } from "@/lib/finance/workspace";
import { materialVariances } from "@/lib/finance/variance";
import { useStore } from "@/lib/store";
import { cx } from "@/lib/format";

type StepState = "idle" | "running" | "done" | "warn";
interface Step { label: string; detail: string; state: StepState }

const INITIAL: Step[] = [
  { label: "Ingest", detail: "Parse and validate the bank export", state: "idle" },
  { label: "Categorize", detail: "Rules and the AI classify each line independently", state: "idle" },
  { label: "Review", detail: "Flag items that need judgment", state: "idle" },
  { label: "Calculate", detail: "Build monthly P&Ls and reconcile to the bank", state: "idle" },
  { label: "Explain", detail: "Find material month-over-month variances", state: "idle" },
];

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
      patch(0, { state: "running" });
      await wait(250);
      patch(0, { state: "done", detail: `Reading ${file.name}` });
      patch(1, { state: "running" });
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/ingest", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      patch(0, { state: data.warnings.length ? "warn" : "done", detail: `${data.transactions.length} transactions from ${data.rowsRead} rows${data.warnings.length ? `, ${data.warnings.length} warnings` : ""}` });
      const patterns = Object.keys(data.ai).length;
      patch(1, {
        state: data.aiStatus === "ok" ? "done" : "warn",
        detail: data.aiStatus === "ok" ? `${patterns} distinct patterns classified by AI and cross-checked against rules` : data.aiStatus === "disabled" ? "AI unavailable, so rules only. Low-confidence items go to review." : `AI call failed, so rules only (${data.aiError?.slice(0, 60)})`,
      });

      const input = { raw: data.transactions, ai: data.ai, corrections: [], resolutions: [] };
      const ws = buildWorkspace(input);
      patch(2, { state: "running" });
      await wait(300);
      patch(2, { state: "done", detail: `${ws.review.length} items flagged for review` });
      patch(3, { state: "running" });
      await wait(300);
      const ok = ws.pnls.every((p) => p.reconciles);
      patch(3, { state: ok ? "done" : "warn", detail: `${ws.pnls.length} monthly P&Ls, ${ok ? "all reconcile to the bank" : "reconciliation gap found"}` });
      patch(4, { state: "running" });
      await wait(300);
      patch(4, { state: "done", detail: `${materialVariances(ws.variances).length} material variances found` });
      await wait(700);
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
  const useSample = () => loadSample("/sample/nyc-restaurant-transactions.xlsx", "NYC Restaurant Co. - Raw Transactions.xlsx");

  return (
    <main className="relative min-h-dvh overflow-hidden">
      <div className="pointer-events-none absolute inset-0 opacity-60">
        <Aurora colorStops={["#3b2f9e", "#a596ff", "#2a8f7a"]} amplitude={0.9} blend={0.6} speed={0.6} />
      </div>
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-ink/70 to-ink" />

      <div className="relative mx-auto grid max-w-6xl gap-14 px-5 pb-16 pt-10 md:grid-cols-[1.15fr_1fr] md:pt-24">
        <section>
          <p className="font-display text-lg font-semibold text-paper">Finz Review</p>
          <BlurText
            text="Hand over the bank export. Get the monthly review back."
            className="mt-10 font-display text-[clamp(2.4rem,5.5vw,4.25rem)] font-semibold leading-[1.02] tracking-tight text-paper"
            delay={90}
            animateBy="words"
          />
          <p className="mt-6 max-w-[52ch] text-lg leading-relaxed text-muted">
            Every transaction is categorized, every total is computed from the ledger, and every answer the analyst
            gives links back to the transactions behind it.
          </p>
          <dl className="mt-10 grid max-w-md grid-cols-2 gap-x-6 gap-y-4 text-sm">
            <div><dt className="text-faint">Numbers</dt><dd className="text-paper">Deterministic, reconciled to bank</dd></div>
            <div><dt className="text-faint">Judgment</dt><dd className="text-iris">AI, always with evidence</dd></div>
          </dl>
        </section>

        <section aria-label="Upload" className="md:pt-16">
          <div
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f && !busy) run(f); }}
            className={cx(
              "rounded-2xl border bg-panel/80 p-6 backdrop-blur-md transition-colors",
              drag ? "border-iris" : "border-line",
            )}
          >
            {!busy ? (
              <>
                <button
                  onClick={() => inputRef.current?.click()}
                  className="flex w-full flex-col items-center gap-3 rounded-xl border border-dashed border-line px-4 py-10 text-center hover:border-iris/60"
                >
                  <Upload className="size-6 text-muted" aria-hidden />
                  <span className="font-medium">Drop a bank export or choose a file</span>
                  <span className="text-sm text-faint">.xlsx, .xls or .csv with date, description and amount columns</span>
                </button>
                <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && run(e.target.files[0])} />
                <div className="my-5 flex items-center gap-3 text-xs text-faint"><span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" /></div>
                <StarBorder as="button" onClick={useSample} className="w-full" color="#a596ff" backgroundColor="#1d2742" borderColor="#28334f" textColor="#ede9e0" speed="5s">
                  <span className="flex items-center justify-center gap-2 text-[15px]">
                    <FileSpreadsheet className="size-4" aria-hidden /> Review the NYC Restaurant Co. sample
                  </span>
                </StarBorder>
                <p className="mt-4 text-center text-sm text-faint">
                  Want to see how it handles ambiguity?{" "}
                  <button onClick={() => loadSample("/sample/messy-bank-export.csv", "messy-bank-export.csv")} className="text-muted underline decoration-line underline-offset-4 hover:text-paper">
                    Try a messy bank export
                  </button>
                </p>
                {error && <p role="alert" className="mt-4 text-sm text-tomato">{error}</p>}
              </>
            ) : (
              <ol className="space-y-4" aria-live="polite">
                {steps.map((s, i) => (
                  <li key={s.label} className="flex gap-4">
                    <span className={cx(
                      "mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border text-xs",
                      s.state === "done" && "border-teal/60 text-teal",
                      s.state === "warn" && "border-amber/60 text-amber",
                      s.state === "running" && "border-iris text-iris",
                      s.state === "idle" && "border-line text-faint",
                    )}>
                      {s.state === "running" ? <Loader2 className="size-3.5 animate-spin" /> : s.state === "done" || s.state === "warn" ? <Check className="size-3.5" /> : i + 1}
                    </span>
                    <div>
                      <p className={cx("font-medium", s.state === "idle" ? "text-faint" : "text-paper")}>{s.label}</p>
                      <p className={cx("text-sm", s.state === "warn" ? "text-amber" : "text-muted")}>{s.detail}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
