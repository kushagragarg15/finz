"use client";

import { useMemo } from "react";
import { buildWorkspace, type Workspace } from "./finance/workspace";
import { useStore } from "./store";

/** Derived, memoised workspace. Every number on screen comes from here. */
export function useWorkspace(): Workspace | null {
  const input = useStore((s) => s.input);
  return useMemo(() => (input ? buildWorkspace(input) : null), [input]);
}
