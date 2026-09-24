"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, PanelRightClose, Trash2 } from "lucide-react";
import ShinyText from "@/components/reactbits/ShinyText";
import { monthLabel } from "@/lib/finance/pnl";
import { useStore } from "@/lib/store";
import { useWorkspace } from "@/lib/useWorkspace";
import { AiMark } from "./bits";
import { Markdown, Trace } from "./Answer";

function suggestions(months: string[]): string[] {
  const name = (m: string) => monthLabel(m, true).split(" ")[0];
  const last = months.at(-1), prev = months.at(-2);
  return [
    last && `What was our revenue in ${name(last)}?`,
    "How much did we spend on payroll each month?",
    prev && last && `Why did operating profit change between ${name(prev)} and ${name(last)}?`,
    "What drove the increase in food costs?",
    "Which transactions need my attention?",
    months.length > 1 ? "What changed most significantly over the review period?" : "What are the biggest expenses this month?",
  ].filter((s): s is string => Boolean(s));
}

export default function Analyst() {
  const ws = useWorkspace();
  const chat = useStore((s) => s.chat);
  const busy = useStore((s) => s.chatBusy);
  const ask = useStore((s) => s.ask);
  const clearChat = useStore((s) => s.clearChat);
  const setOpen = useStore((s) => s.setAnalystOpen);
  const setMobile = useStore((s) => s.setAnalystMobile);
  const [draft, setDraft] = useState("");
  const [model, setModel] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/status").then((r) => r.json()).then((s) => setModel(s.model)).catch(() => {});
  }, []);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [chat.length, busy]);

  const send = (q: string) => {
    if (!q.trim() || busy) return;
    setDraft("");
    ask(q);
  };

  return (
    <aside aria-label="AI analyst" className="flex h-full flex-col border-l border-line bg-ink-2">
      <header className="flex items-center gap-2 border-b border-line px-4 py-3">
        <h2 className="flex-1 font-display font-semibold">Analyst <span className="ml-1"><AiMark label={model ? `${model.split("/").pop()} on Groq` : "on Groq"} /></span></h2>
        {chat.length > 0 && (
          <button onClick={clearChat} className="text-faint hover:text-paper" aria-label="Clear conversation" title="Clear conversation"><Trash2 className="size-4" /></button>
        )}
        <button onClick={() => { setOpen(false); setMobile(false); }} className="text-faint hover:text-paper" aria-label="Hide analyst"><PanelRightClose className="size-4" /></button>
      </header>

      <div ref={scroller} className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
        {chat.length === 0 && (
          <div>
            <p className="text-sm text-muted">
              Ask anything about these books. Every figure comes from the ledger, and the analyst cites the transactions behind it.
            </p>
            <ul className="mt-4 space-y-2">
              {suggestions(ws?.months ?? []).map((s) => (
                <li key={s}>
                  <button onClick={() => send(s)} className="w-full rounded-lg border border-line px-3 py-2 text-left text-sm text-paper hover:border-iris/60 hover:bg-panel">
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {chat.map((t) =>
          t.role === "user" ? (
            <div key={t.id} className="ml-8 rounded-xl bg-panel-2 px-3 py-2 text-sm">{t.content}</div>
          ) : (
            <div key={t.id} className="border-l-2 border-iris/50 pl-3">
              {t.error ? <p className="text-sm text-amber">{t.content}</p> : <Markdown text={t.content} />}
              {t.reply && <Trace reply={t.reply} />}
            </div>
          ),
        )}
        {busy && <ShinyText text="Querying the ledger…" color="#8b80d6" shineColor="#ede9e0" speed={1.8} className="text-sm" />}
      </div>

      <form onSubmit={(e) => { e.preventDefault(); send(draft); }} className="border-t border-line p-3">
        <div className="flex items-end gap-2 rounded-xl border border-line bg-panel px-3 py-2 focus-within:border-iris">
          <label htmlFor="ask" className="sr-only">Ask the analyst</label>
          <textarea
            id="ask"
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(draft); } }}
            placeholder="Why did food costs rise in March?"
            className="max-h-32 flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-faint"
          />
          <button disabled={!draft.trim() || busy} className="grid size-7 place-items-center rounded-lg bg-iris text-ink disabled:opacity-30" aria-label="Send">
            <ArrowUp className="size-4" />
          </button>
        </div>
      </form>
    </aside>
  );
}
