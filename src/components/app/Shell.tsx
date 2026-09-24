"use client";

import { FileText, ListChecks, MessagesSquare, Receipt, RotateCcw, TrendingUp } from "lucide-react";
import { useStore, type View } from "@/lib/store";
import { useWorkspace } from "@/lib/useWorkspace";
import { cx } from "@/lib/format";
import Analyst from "./Analyst";
import Overview from "./Overview";
import ReviewQueue from "./ReviewQueue";
import Transactions from "./Transactions";
import TxnDrawer from "./TxnDrawer";
import Variances from "./Variances";

export default function Shell() {
  const ws = useWorkspace();
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const meta = useStore((s) => s.meta);
  const reset = useStore((s) => s.reset);
  const analystOpen = useStore((s) => s.analystOpen);
  const setAnalystOpen = useStore((s) => s.setAnalystOpen);
  const analystMobile = useStore((s) => s.analystMobile);
  const setAnalystMobile = useStore((s) => s.setAnalystMobile);
  if (!ws) return null;
  const openReview = ws.review.filter((i) => i.resolution?.status !== "resolved").length;

  const NAV: { id: View; label: string; icon: typeof FileText; badge?: number }[] = [
    { id: "overview", label: "P&L", icon: FileText },
    { id: "variances", label: "Variances", icon: TrendingUp },
    { id: "review", label: "Needs review", icon: ListChecks, badge: openReview },
    { id: "transactions", label: "Transactions", icon: Receipt },
  ];

  return (
    <div className="flex h-dvh flex-col md:flex-row">
      <nav aria-label="Main" className="flex shrink-0 items-center gap-1 border-b border-line bg-ink-2 px-3 py-2 md:w-56 md:flex-col md:items-stretch md:border-b-0 md:border-r md:px-3 md:py-5">
        <p className="hidden px-2 pb-6 font-display text-lg font-semibold md:block">Finz Review</p>
        {NAV.map((n) => (
          <button
            key={n.id}
            onClick={() => setView(n.id)}
            aria-current={view === n.id ? "page" : undefined}
            className={cx("flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm", view === n.id ? "bg-panel-2 text-paper" : "text-muted hover:bg-panel hover:text-paper")}
          >
            <n.icon className="size-4" aria-hidden />
            <span className="hidden sm:inline">{n.label}</span>
            {!!n.badge && <span className="num ml-auto rounded-full bg-amber/15 px-1.5 text-xs text-amber">{n.badge}</span>}
          </button>
        ))}
        <button
          onClick={() => { setAnalystOpen(true); setAnalystMobile(true); }}
          className={cx("flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-iris hover:bg-panel", analystOpen && "md:hidden")}
        >
          <MessagesSquare className="size-4" aria-hidden /> <span className="hidden sm:inline">Analyst</span>
        </button>
        <div className="ml-auto md:mt-auto md:ml-0">
          <div className="hidden px-2.5 pb-3 text-xs text-faint md:block">
            <p className="truncate text-muted" title={meta?.fileName}>{meta?.fileName}</p>
            <p>{meta?.aiStatus === "ok" ? "AI categorization on" : "Rules only"}</p>
          </div>
          <button onClick={() => { if (confirm("Start over with a new file? Corrections will be discarded.")) reset(); }} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-muted hover:bg-panel hover:text-paper">
            <RotateCcw className="size-4" aria-hidden /> <span className="hidden sm:inline">New file</span>
          </button>
        </div>
      </nav>

      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-4 py-8 md:px-8 md:py-10">
          {view === "overview" && <Overview />}
          {view === "transactions" && <Transactions />}
          {view === "review" && <ReviewQueue />}
          {view === "variances" && <Variances />}
        </div>
      </main>

      {(analystOpen || analystMobile) && (
        <div className={cx(
          "fixed inset-0 z-40 md:static md:inset-auto md:z-auto md:w-[24rem] md:shrink-0 xl:w-[27rem]",
          !analystMobile && "hidden md:block",
          !analystOpen && "md:hidden",
        )}>
          <Analyst />
        </div>
      )}
      <TxnDrawer />
    </div>
  );
}
