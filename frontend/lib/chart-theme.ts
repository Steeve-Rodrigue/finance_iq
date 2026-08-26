"use client";

import { useState } from "react";

// Chart colors read live from globals.css's CSS custom properties (oklch strings) rather than
// hardcoded, so ECharts stays in sync with the design system without a duplicate palette.
export type ChartColors = {
  foreground: string;
  mutedForeground: string;
  border: string;
  primary: string;
  card: string;
};

const FALLBACK: ChartColors = {
  foreground: "#0a0a0a",
  mutedForeground: "#8e8e8e",
  border: "#e5e5e5",
  primary: "#e8b64c",
  card: "#ffffff",
};

function resolveChartColors(): ChartColors {
  const style = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) =>
    style.getPropertyValue(name).trim() || fallback;

  return {
    foreground: read("--foreground", FALLBACK.foreground),
    mutedForeground: read("--muted-foreground", FALLBACK.mutedForeground),
    border: read("--border", FALLBACK.border),
    primary: read("--primary", FALLBACK.primary),
    card: read("--card", FALLBACK.card),
  };
}

// Lazy initializer (not an effect) - it re-runs on the client's first mount, when
// `document` is actually available, without an extra render pass. SSR gets FALLBACK, but
// ECharts only paints inside its own client-only effect, so there's no hydration mismatch.
export function useChartColors(): ChartColors {
  const [colors] = useState<ChartColors>(() =>
    typeof document === "undefined" ? FALLBACK : resolveChartColors(),
  );

  return colors;
}
