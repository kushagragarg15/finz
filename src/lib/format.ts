export const money = (n: number, opts: { cents?: boolean; sign?: boolean } = {}) => {
  const { cents = false, sign = false } = opts;
  const s = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });
  const prefix = n < 0 ? "−" : sign && n > 0 ? "+" : "";
  return `${prefix}$${s}`;
};

export const pct = (n: number | null, sign = true) => (n === null ? "—" : `${sign && n > 0 ? "+" : ""}${n.toFixed(1)}%`);

export const cx = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(" ");
