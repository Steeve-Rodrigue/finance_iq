const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

const preciseCurrencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// "€1,420" - EUR, no decimals, symbol-first (matches frontend/CLAUDE.md's example format).
// Fine for aggregates (KPI tiles, chart axes) where whole-euro rounding reads cleaner, but
// loses cents on a real invoice amount - pass `precise` for a single bill's exact total.
export function formatCurrency(
  value: string | number,
  options?: { precise?: boolean },
): string {
  const formatter = options?.precise
    ? preciseCurrencyFormatter
    : currencyFormatter;
  return formatter.format(Number(value));
}

// API percentages are already 0-100 scale (e.g. "40.0" = 40%) - do NOT multiply by 100.
export function formatPercent(
  value: string | number,
  fractionDigits = 0,
): string {
  return `${Number(value).toFixed(fractionDigits)}%`;
}

// offset 0 = current month, -1 = previous, -2 = month-before-previous, relative to `from`
// (defaults to now). includeYear defaults false - frontend/CLAUDE.md's Overview example only
// shows the year on the current month ("February 2026" vs "January" / "December").
export function formatMonthLabel(
  offset: number,
  options?: { includeYear?: boolean; from?: Date },
): string {
  const base = options?.from ?? new Date();
  const d = new Date(base.getFullYear(), base.getMonth() + offset, 1);
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    ...(options?.includeYear ? { year: "numeric" } : {}),
  }).format(d);
}
