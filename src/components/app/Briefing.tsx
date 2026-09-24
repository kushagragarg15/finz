"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import ShinyText from "@/components/reactbits/ShinyText";
import type { AnalystReply } from "@/lib/ai/analyst";
import { askAnalyst, dataKey } from "@/lib/client";
import { useStore } from "@/lib/store";
import { AiMark } from "./bits";
import { Markdown, Trace } from "./Answer";

const BRIEF_Q =
  "Write my executive briefing for the review period: how operating profit moved month to month and why (separating timing effects and one-offs from underlying trends), the single biggest cost pressure, and the top items that need my attention before these numbers are final. Maximum 6 bullets.";

export default function Briefing() {
  const input = useStore((s) => s.input)!;
  const meta = useStore((s) => s.meta);
  const [cached] = useState<{ key: string; reply: AnalystReply } | null>(() => {
    try { return JSON.parse(sessionStorage.getItem("finz-briefing") ?? "null"); } catch { return null; }
  });
  const [reply, setReply] = useState<AnalystReply | null>(cached?.reply ?? null);
  const [key, setKey] = useState<string | null>(cached?.key ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  const current = dataKey(input);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await askAnalyst(input, [{ role: "user", content: BRIEF_Q }]);
      setReply(r);
      setKey(current);
      try { sessionStorage.setItem("finz-briefing", JSON.stringify({ key: current, reply: r })); } catch {}
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (cached?.key === current || meta?.aiStatus === "disabled") return;
    // Deferred so state updates happen outside the effect body.
    queueMicrotask(run);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section aria-labelledby="brief-h" className="relative overflow-hidden rounded-2xl border border-iris/25 bg-gradient-to-br from-iris-deep/15 via-panel to-panel p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="brief-h" className="flex items-center gap-3 font-display text-lg font-semibold">
          Analyst briefing <AiMark label="Written by AI from computed figures" />
        </h2>
        {(reply || error) && (
          <button onClick={run} disabled={loading} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-paper disabled:opacity-40">
            <RefreshCw className="size-3.5" aria-hidden /> {key && key !== current ? "Numbers changed, so refresh" : "Regenerate"}
          </button>
        )}
      </div>
      <div className="mt-3 max-w-[80ch] text-muted">
        {loading ? (
          <ShinyText text="Reading the P&L, variances and review queue…" color="#8b80d6" shineColor="#ede9e0" speed={2} className="text-sm" />
        ) : error ? (
          <p className="text-sm text-amber">{error}</p>
        ) : reply ? (
          <>
            <Markdown text={reply.answer} />
            <Trace reply={reply} />
          </>
        ) : (
          <button onClick={run} className="text-sm text-iris hover:underline">Generate briefing</button>
        )}
      </div>
    </section>
  );
}
