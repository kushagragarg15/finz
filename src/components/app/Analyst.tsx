"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Trash2, X } from "lucide-react";
import ShinyText from "@/components/reactbits/ShinyText";
import { monthLabel } from "@/lib/finance/pnl";
import { useStore } from "@/lib/store";
import { useWorkspace } from "@/lib/useWorkspace";
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
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [chat.length, busy]);

  const send = (q: string) => {
    if (!q.trim() || busy) return;
    setDraft("");
    ask(q);
  };

  const close = () => {
    setMobile(false);
    if (window.matchMedia("(min-width: 1024px)").matches) setOpen(false);
  };

  return (
    <aside aria-label="Analyst" className="flex h-full flex-col border-l border-rule bg-sheet">
      <header className="flex min-h-14 shrink-0 items-center gap-2 border-b border-rule px-4 py-2">
        <div className="flex-1">
          <h2 className="font-cond text-base font-semibold leading-tight">Ask about these books</h2>
          <p className="text-xs text-ink-3">Figures come from the ledger, with their transactions.</p>
        </div>
        {chat.length > 0 && (
          <button onClick={clearChat} className="grid size-9 place-items-center rounded-md text-ink-3 hover:bg-sheet-2 hover:text-ink" aria-label="Clear conversation" title="Clear conversation">
            <Trash2 className="size-4" />
          </button>
        )}
        <button onClick={close} className="grid size-9 place-items-center rounded-md text-ink-3 hover:bg-sheet-2 hover:text-ink" aria-label="Close analyst">
          <X className="size-5" />
        </button>
      </header>

      <div ref={scroller} className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
        {chat.length === 0 && (
          <div>
            <p className="text-sm text-ink-2">Try one of these, or ask your own.<span className="hidden lg:inline"> Press <kbd className="rounded border border-rule-strong px-1 text-xs">/</kbd> from anywhere to jump here.</span></p>
            <ul className="mt-2 divide-y divide-rule border-y border-rule">
              {suggestions(ws?.months ?? []).map((s) => (
                <li key={s}>
                  <button onClick={() => send(s)} className="w-full py-2.5 text-left text-sm text-ink hover:text-ai">
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {chat.map((t) =>
          t.role === "user" ? (
            <p key={t.id} className="ml-8 rounded-md bg-sheet-2 px-3 py-2 text-sm">{t.content}</p>
          ) : (
            <div key={t.id} className="border-l-2 border-ai pl-3">
              {t.error ? <p className="text-sm text-flag">{t.content}</p> : <Markdown text={t.content} />}
              {t.reply && <Trace reply={t.reply} />}
            </div>
          ),
        )}
        {busy && <ShinyText text="Looking it up in the ledger…" color="#6d86e6" shineColor="#1b2233" speed={1.8} className="text-sm" />}
      </div>

      <form onSubmit={(e) => { e.preventDefault(); send(draft); }} className="pb-safe shrink-0 border-t border-rule p-3">
        <div className="flex items-end gap-2 rounded-md border border-rule-strong bg-sheet px-3 py-2 focus-within:border-ai">
          <label htmlFor="ask" className="sr-only">Ask a question about these books</label>
          <textarea
            id="ask"
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(draft); } }}
            placeholder="Why did food costs rise in March?"
            className="max-h-32 min-h-7 flex-1 resize-none bg-transparent py-1 text-[16px] outline-none placeholder:text-ink-3 sm:text-sm"
          />
          <button disabled={!draft.trim() || busy} className="grid size-9 shrink-0 place-items-center rounded-md bg-ink text-white disabled:opacity-25" aria-label="Ask">
            <ArrowUp className="size-4" />
          </button>
        </div>
      </form>
    </aside>
  );
}
