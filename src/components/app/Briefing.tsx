"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import ShinyText from "@/components/reactbits/ShinyText";
import type { AnalystReply } from "@/lib/ai/analyst";
import { dataKey, getBriefing } from "@/lib/client";
import { useStore } from "@/lib/store";
import { Markdown, Trace } from "./Answer";

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
      const r = await getBriefing(input);
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
    <section aria-labelledby="brief-h" className="border-l-2 border-ai pl-4 sm:pl-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="brief-h" className="font-cond text-lg font-semibold">
          Analyst&apos;s summary <span className="ml-1 font-sans text-xs font-normal text-ai">written by AI from the figures below</span>
        </h2>
        {(reply || error) && (
          <button onClick={run} disabled={loading} className="inline-flex items-center gap-1.5 text-sm text-ink-2 hover:text-ink disabled:opacity-40">
            <RefreshCw className="size-3.5" aria-hidden /> {key && key !== current ? "Figures changed, rewrite summary" : "Rewrite"}
          </button>
        )}
      </div>
      <div className="mt-2 max-w-[78ch]">
        {loading ? (
          <ShinyText text="Reading the statement, changes and review list…" color="#6d86e6" shineColor="#1b2233" speed={2} className="text-sm" />
        ) : error ? (
          <p className="text-sm text-flag">{error}</p>
        ) : reply ? (
          <>
            <Markdown text={reply.answer} />
            <Trace reply={reply} />
          </>
        ) : (
          <button onClick={run} className="text-sm text-ai hover:underline">Write a summary</button>
        )}
      </div>
    </section>
  );
}
