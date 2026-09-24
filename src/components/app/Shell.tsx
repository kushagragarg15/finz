"use client";

import { useEffect, useState } from "react";
import { Download, FileText, ListChecks, MessageSquareText, Receipt, RotateCcw, TrendingUp } from "lucide-react";
import { exportWorkpaper } from "@/lib/export";
import { useStore, type View } from "@/lib/store";
import { useWorkspace } from "@/lib/useWorkspace";
import { cx } from "@/lib/format";
import Analyst from "./Analyst";
import Overview from "./Overview";
import ReviewQueue from "./ReviewQueue";
import Transactions from "./Transactions";
import TxnDrawer from "./TxnDrawer";
import Variances from "./Variances";

const VIEWS: View[] = ["overview", "variances", "review", "transactions"];

/** Keep the current view (and focused variance) in the URL so a link reopens the same place. */
function useHashRoute() {
  const view = useStore((s) => s.view);
  const focus = useStore((s) => s.focusVarianceId);
  useEffect(() => {
    const apply = () => {
      const [v, id] = decodeURIComponent(location.hash.slice(1)).split("/");
      if (!VIEWS.includes(v as View)) return;
      if (v === "variances" && id) useStore.getState().focusVariance(id);
      else useStore.getState().setView(v as View);
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, []);
  useEffect(() => {
    const next = view === "variances" && focus ? `#variances/${encodeURIComponent(focus)}` : `#${view}`;
    if (location.hash !== next) history.replaceState(null, "", next);
  }, [view, focus]);
  // A new view (or a different change) starts at the top.
  useEffect(() => {
    document.getElementById("main")?.scrollTo({ top: 0 });
  }, [view, focus]);
}

/** Press "/" anywhere (outside a text field) to jump to the analyst. */
function useAskShortcut() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key !== "/" || e.metaKey || e.ctrlKey || el.closest("input, textarea, select, [contenteditable]")) return;
      e.preventDefault();
      const s = useStore.getState();
      if (window.matchMedia("(min-width: 1024px)").matches) s.setAnalystOpen(true);
      else s.setAnalystMobile(true);
      requestAnimationFrame(() => document.getElementById("ask")?.focus());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

function StartOver() {
  const reset = useStore((s) => s.reset);
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return armed ? (
    <button onClick={reset} className="h-9 rounded-md bg-neg px-3 text-sm font-medium text-white">
      Discard review and start over
    </button>
  ) : (
    <button onClick={() => setArmed(true)} className="inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-sm text-ink-2 hover:bg-sheet-2 hover:text-ink" title="Start over with a new file">
      <RotateCcw className="size-4" aria-hidden /> <span className="hidden xl:inline">New file</span>
    </button>
  );
}

export default function Shell() {
  useHashRoute();
  useAskShortcut();
  const ws = useWorkspace();
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const meta = useStore((s) => s.meta);
  const input = useStore((s) => s.input);
  const analystOpen = useStore((s) => s.analystOpen);
  const setAnalystOpen = useStore((s) => s.setAnalystOpen);
  const analystMobile = useStore((s) => s.analystMobile);
  const setAnalystMobile = useStore((s) => s.setAnalystMobile);
  const [exporting, setExporting] = useState(false);
  if (!ws || !input) return null;
  const openReview = ws.review.filter((i) => i.resolution?.status !== "resolved").length;

  const NAV: { id: View; label: string; short: string; icon: typeof FileText; badge?: number }[] = [
    { id: "overview", label: "P&L", short: "P&L", icon: FileText },
    { id: "variances", label: "Changes", short: "Changes", icon: TrendingUp },
    { id: "review", label: "Needs review", short: "Review", icon: ListChecks, badge: openReview },
    { id: "transactions", label: "Ledger", short: "Ledger", icon: Receipt },
  ];

  const onExport = async () => {
    setExporting(true);
    try { await exportWorkpaper(ws, input.corrections, meta?.fileName ?? "workpaper"); } finally { setExporting(false); }
  };

  return (
    <div className="flex h-dvh flex-col">
      <header className="z-30 border-b border-rule bg-sheet">
        <div className="flex h-14 items-center gap-3 px-3 sm:px-5">
          <p className="font-cond text-lg font-semibold tracking-tight">Finz Review</p>
          <p className="hidden min-w-0 truncate text-sm text-ink-3 sm:block" title={meta?.fileName}>{meta?.fileName}</p>

          <nav aria-label="Sections" className="ml-4 hidden h-14 items-stretch md:flex">
            {NAV.map((n) => (
              <button
                key={n.id}
                onClick={() => setView(n.id)}
                aria-current={view === n.id ? "page" : undefined}
                className={cx(
                  "relative flex items-center gap-2 px-3 text-sm",
                  view === n.id ? "text-ink after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-ink" : "text-ink-2 hover:text-ink",
                )}
              >
                {n.label}
                {!!n.badge && <span className="num rounded-full bg-flag-wash px-1.5 text-xs font-medium text-flag">{n.badge}</span>}
              </button>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1">
            <button onClick={onExport} disabled={exporting} className="inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-sm text-ink-2 hover:bg-sheet-2 hover:text-ink disabled:opacity-50" title="Download the reviewed workpaper as Excel">
              <Download className="size-4" aria-hidden /> <span className="hidden sm:inline">{exporting ? "Preparing…" : "Export .xlsx"}</span>
            </button>
            <StartOver />
            <button
              onClick={() => (window.matchMedia("(min-width: 1024px)").matches ? setAnalystOpen(!analystOpen) : setAnalystMobile(true))}
              aria-pressed={analystOpen}
              className={cx("ml-1 hidden h-9 items-center gap-1.5 rounded-md border px-3 text-sm md:inline-flex", analystOpen ? "border-ai/40 bg-ai-wash text-ai" : "border-rule-strong text-ink hover:border-ink-3")}
            >
              <MessageSquareText className="size-4" aria-hidden /> Analyst
            </button>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <main id="main" className="min-w-0 flex-1 overflow-y-auto pb-20 md:pb-0">
          <div className="mx-auto max-w-5xl px-3 py-6 sm:px-6 md:py-8">
            {view === "overview" && <Overview />}
            {view === "variances" && <Variances />}
            {view === "review" && <ReviewQueue />}
            {view === "transactions" && <Transactions />}
          </div>
        </main>

        {/* Desktop: docked in the margin. Smaller screens: full-screen sheet when asked for. */}
        <div
          className={cx(
            "fixed inset-0 z-40 lg:static lg:z-auto lg:w-[380px] lg:shrink-0 xl:w-[420px]",
            analystMobile ? "block" : "hidden",
            analystOpen ? "lg:block" : "lg:hidden",
          )}
        >
          <Analyst />
        </div>
      </div>

      <nav aria-label="Sections" className="pb-safe fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-rule bg-sheet md:hidden">
        {NAV.map((n) => (
          <button
            key={n.id}
            onClick={() => setView(n.id)}
            aria-current={view === n.id ? "page" : undefined}
            className={cx("relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px]", view === n.id ? "text-ink" : "text-ink-3")}
          >
            <n.icon className="size-5" aria-hidden />
            {n.short}
            {!!n.badge && <span className="num absolute right-[22%] top-1.5 rounded-full bg-flag px-1 text-[10px] font-medium leading-4 text-white">{n.badge}</span>}
          </button>
        ))}
        <button onClick={() => setAnalystMobile(true)} className="flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] text-ai">
          <MessageSquareText className="size-5" aria-hidden />
          Ask
        </button>
      </nav>

      <TxnDrawer />
    </div>
  );
}
