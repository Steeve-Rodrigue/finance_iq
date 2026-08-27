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

// globals.css defines every theme color as oklch(...) (Tailwind v4's default). The zrender
// build bundled with echarts can only parse hex/rgb(a)/hsl(a) (verified against
// node_modules/zrender/lib/tool/color.js's `parse()` - its oklch case falls through to
// `default: return;`, i.e. undefined). ECharts computes hover/emphasis highlight colors by
// lightening the base color internally on interaction; running that math on `undefined`
// throws mid-frame and aborts the canvas repaint - which is what made a hovered line/point
// vanish instead of just failing to highlight. Round-tripping through a 2D canvas context's
// `fillStyle` setter/getter is the standard workaround: the browser normalizes ANY valid CSS
// color (oklch included) down to the `#rrggbb` / `rgba(...)` formats zrender does understand.
function toParsableColor(cssColor: string): string {
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return cssColor;
  ctx.fillStyle = cssColor;
  return ctx.fillStyle;
}

function resolveChartColors(): ChartColors {
  const style = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => {
    const value = style.getPropertyValue(name).trim();
    return value ? toParsableColor(value) : fallback;
  };

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

// For gradient-fill areaStyles (see spending-trend-chart.tsx etc.): takes one of the already-
// normalized ChartColors values and returns a translucent rgba() variant at the given alpha
// (0-1), via the same canvas round-trip as toParsableColor - `color-mix()` is itself a CSS
// Color 5 function zrender can't parse any more than oklch() can, so it has to get resolved by
// the browser first too, same reasoning as above.
export function withAlpha(color: string, alpha: number): string {
  if (typeof document === "undefined") return color;
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return color;
  ctx.fillStyle = `color-mix(in srgb, ${color} ${Math.round(alpha * 100)}%, transparent)`;
  return ctx.fillStyle;
}
