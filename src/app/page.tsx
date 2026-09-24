"use client";

import { useSyncExternalStore } from "react";
import Landing from "@/components/app/Landing";
import Shell from "@/components/app/Shell";
import { useStore } from "@/lib/store";

const subscribe = (cb: () => void) => useStore.persist.onFinishHydration(cb);

export default function Home() {
  const input = useStore((s) => s.input);
  // The workspace lives in localStorage; wait for hydration to avoid a flash of the landing page.
  const hydrated = useSyncExternalStore(subscribe, () => useStore.persist.hasHydrated(), () => false);
  if (!hydrated) return <div className="min-h-dvh bg-ink" />;
  return input ? <Shell /> : <Landing />;
}
