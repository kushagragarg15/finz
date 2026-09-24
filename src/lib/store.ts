"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { AnalystReply } from "./ai/analyst";
import { askAnalyst } from "./client";
import type { Correction, ReviewResolution } from "./finance/types";
import type { WorkspaceInput } from "./finance/workspace";

export type View = "overview" | "transactions" | "review" | "variances";

export interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  reply?: Omit<AnalystReply, "answer">;
  error?: boolean;
}

interface Meta {
  fileName: string;
  ingestedAt: string;
  warnings: string[];
  aiStatus: "ok" | "disabled" | "failed";
  aiError?: string;
}

interface State {
  input: WorkspaceInput | null;
  meta: Meta | null;
  view: View;
  chat: ChatTurn[];
  analystOpen: boolean;
  /** Small screens show the analyst as an overlay only when asked. */
  analystMobile: boolean;
  drawerTxnIds: string[] | null;
  drawerTitle: string;
  focusVarianceId: string | null;
  narratives: Record<string, { text: string; source: "ai" | "template"; key: string }>;
  chatBusy: boolean;

  loadWorkspace: (input: WorkspaceInput, meta: Meta) => void;
  reset: () => void;
  setView: (v: View) => void;
  correct: (c: Omit<Correction, "at">) => void;
  undoCorrection: (index: number) => void;
  resolve: (itemId: string, note: string) => void;
  reopen: (itemId: string) => void;
  pushChat: (t: ChatTurn) => void;
  clearChat: () => void;
  setAnalystOpen: (o: boolean) => void;
  setAnalystMobile: (o: boolean) => void;
  openTxns: (ids: string[], title: string) => void;
  closeDrawer: () => void;
  focusVariance: (id: string | null) => void;
  setNarrative: (id: string, n: { text: string; source: "ai" | "template"; key: string }) => void;
  ask: (q: string) => Promise<void>;
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      input: null,
      meta: null,
      view: "overview",
      chat: [],
      analystOpen: true,
      analystMobile: false,
      drawerTxnIds: null,
      drawerTitle: "",
      focusVarianceId: null,
      narratives: {},
      chatBusy: false,

      loadWorkspace: (input, meta) => set({ input, meta, view: "overview", chat: [], narratives: {}, focusVarianceId: null }),
      reset: () => set({ input: null, meta: null, chat: [], narratives: {}, drawerTxnIds: null }),
      setView: (view) => set({ view }),
      correct: (c) =>
        set((s) => (s.input ? { input: { ...s.input, corrections: [...s.input.corrections, { ...c, at: new Date().toISOString() }] } } : {})),
      undoCorrection: (index) =>
        set((s) => (s.input ? { input: { ...s.input, corrections: s.input.corrections.filter((_, i) => i !== index) } } : {})),
      resolve: (itemId, note) =>
        set((s) =>
          s.input
            ? { input: { ...s.input, resolutions: [...s.input.resolutions.filter((r) => r.itemId !== itemId), { itemId, status: "resolved", note, at: new Date().toISOString() } as ReviewResolution] } }
            : {},
        ),
      reopen: (itemId) =>
        set((s) => (s.input ? { input: { ...s.input, resolutions: s.input.resolutions.filter((r) => r.itemId !== itemId) } } : {})),
      pushChat: (t) => set((s) => ({ chat: [...s.chat, t] })),
      clearChat: () => set({ chat: [] }),
      setAnalystOpen: (analystOpen) => set({ analystOpen }),
      setAnalystMobile: (analystMobile) => set({ analystMobile }),
      openTxns: (ids, title) => set({ drawerTxnIds: ids, drawerTitle: title }),
      closeDrawer: () => set({ drawerTxnIds: null }),
      focusVariance: (focusVarianceId) => set({ focusVarianceId, view: "variances" }),
      setNarrative: (id, n) => set((s) => ({ narratives: { ...s.narratives, [id]: n } })),
      ask: async (q) => {
        const question = q.trim();
        const { input, chat, chatBusy } = get();
        if (!question || chatBusy || !input) return;
        const history = chat.filter((t) => !t.error).map((t) => ({ role: t.role, content: t.content }));
        set({ analystOpen: true, analystMobile: true, chatBusy: true, chat: [...chat, { id: crypto.randomUUID(), role: "user", content: question }] });
        try {
          const { answer, ...reply } = await askAnalyst(input, [...history, { role: "user", content: question }]);
          set((s) => ({ chat: [...s.chat, { id: crypto.randomUUID(), role: "assistant", content: answer, reply }] }));
        } catch (e) {
          set((s) => ({ chat: [...s.chat, { id: crypto.randomUUID(), role: "assistant", content: (e as Error).message, error: true }] }));
        } finally {
          set({ chatBusy: false });
        }
      },
    }),
    {
      name: "finz-review-v1",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ input: s.input, meta: s.meta, chat: s.chat, narratives: s.narratives, analystOpen: s.analystOpen }),
    },
  ),
);
