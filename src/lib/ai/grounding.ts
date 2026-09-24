/**
 * Grounding check: every financial figure in an AI answer must be traceable to
 * a number returned by a deterministic tool. The LLM never produces totals —
 * if it states a number we cannot find in the tool outputs, we flag it and
 * ask the model to rewrite.
 */

export interface GroundingResult {
  verified: boolean;
  checked: number;
  unverified: string[];
}

/** Recursively collect every number that appears in tool outputs. */
export function collectNumbers(value: unknown, out: number[] = []): number[] {
  if (typeof value === "number" && isFinite(value)) out.push(value);
  else if (typeof value === "string") {
    // numbers embedded in deterministic text (e.g. context facts)
    for (const m of value.matchAll(/-?\$?\d[\d,]*(?:\.\d+)?/g)) {
      const n = Number(m[0].replace(/[$,]/g, ""));
      if (isFinite(n)) out.push(n);
    }
  } else if (Array.isArray(value)) value.forEach((v) => collectNumbers(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => collectNumbers(v, out));
  return out;
}

interface Figure {
  raw: string;
  value: number;
  scale: number; // tolerance multiplier for K/M abbreviations
  percent: boolean;
}

export function extractFigures(text: string): Figure[] {
  const figures: Figure[] = [];
  // $12,345.67 | 12,345 | 12.5K | $1.2M | 14.3%
  const re = /(?<![A-Za-z\d])(-|−)?\$?(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?\s?(k|K|m|M)?(%)?/g;
  for (const m of text.matchAll(re)) {
    const raw = m[0];
    const before = text.slice(Math.max(0, m.index! - 1), m.index!);
    if (/[T#]/.test(before)) continue; // transaction ids like T1179
    const base = Number(`${m[2].replace(/,/g, "")}${m[3] ?? ""}`);
    const mult = m[4] ? (m[4].toLowerCase() === "k" ? 1_000 : 1_000_000) : 1;
    const value = base * mult;
    const percent = Boolean(m[5]);
    const hasDollar = raw.includes("$");
    // ignore small counts, years and day numbers unless they are money or percentages
    if (!hasDollar && !percent && !m[4] && (value < 100 || (value >= 1900 && value <= 2100 && !m[3] && !raw.includes(",")))) continue;
    figures.push({ raw: raw.trim(), value, scale: mult, percent });
  }
  return figures;
}

export function checkGrounding(answer: string, toolOutputs: unknown[]): GroundingResult {
  const pool = collectNumbers(toolOutputs).map((n) => Math.abs(n));
  const figures = extractFigures(answer);
  const unverified: string[] = [];
  for (const f of figures) {
    const v = Math.abs(f.value);
    // tolerance: rounding to whole dollars / one decimal, or the abbreviation's precision
    const tol = f.scale > 1 ? f.scale * 0.05 : f.percent ? 0.15 : 1.01;
    const ok = pool.some((p) => Math.abs(p - v) <= tol);
    if (!ok) unverified.push(f.raw);
  }
  return { verified: unverified.length === 0, checked: figures.length, unverified: [...new Set(unverified)] };
}
