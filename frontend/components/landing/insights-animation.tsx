"use client";

import { Check, LineChart, Sparkles, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

// The landing page's right-column animation (frontend/app/page.tsx). Deliberately
// flat/CSS+SVG only - no chart or 3D library, unlike
// components/landing/workflow-demo.tsx's react-three-fiber scene, which this replaces in
// spirit but not in code (that component stays as-is, just unused by the real page).
// Four phases loop on a plain timer: scan -> analyze -> insights -> chart -> back to
// scan. Each phase is an absolutely-stacked panel cross-faded via opacity, same
// technique workflow-demo.tsx uses for its own phase switching. Every phase uses a
// header row + a flex-1 body so content actually stretches to fill whatever height the
// card ends up with, rather than staying a small fixed island centered in empty space.
type Phase = "scan" | "analyze" | "insights" | "chart";

const PHASES: Phase[] = ["scan", "analyze", "insights", "chart"];
const PHASE_DURATION_MS = 4200;

const PHASE_LABELS: Record<Phase, string> = {
  scan: "Scanning",
  analyze: "Analyzing",
  insights: "Insights",
  chart: "Trends",
};

// Text-line placeholders for the mock document - varied widths plus dividers, same
// shape idea as workflow-demo.tsx's PDF_LINES, written fresh here (flat divs, not that
// file's canvas-rendered version).
const DOC_LINES = [
  { width: "75%" },
  { width: "50%" },
  { width: "90%" },
  { width: "60%", divider: true },
  { width: "55%" },
  { width: "80%" },
  { width: "45%" },
  { width: "65%", divider: true },
  { width: "35%", bold: true },
];

// Same example fields workflow-demo.tsx uses, plus payment method, for content
// consistency across the app's two demo surfaces.
const FIELDS = [
  { label: "Vendor", value: "Carrefour" },
  { label: "Invoice #", value: "INV-20264" },
  { label: "Date", value: "12 Feb 2026" },
  { label: "Total", value: "€248.50" },
  { label: "Category", value: "Groceries" },
];

const INSIGHTS = [
  { value: "€4,820", label: "Total spent this month" },
  { value: "91%", label: "Auto-resolved, no review needed" },
  { value: "47", label: "Bills processed" },
  { value: "0.94", label: "Average parser confidence" },
];

// Six months of a mock spending trend, drawn as an SVG line + filled area. `value` (0-100)
// only drives the point's y-position; `amount` is the euro figure actually printed above
// each point on the line.
const CHART_POINTS = [
  { label: "Sep", value: 32, amount: "€620" },
  { label: "Oct", value: 48, amount: "€890" },
  { label: "Nov", value: 40, amount: "€740" },
  { label: "Dec", value: 63, amount: "€1,180" },
  { label: "Jan", value: 55, amount: "€1,020" },
  { label: "Feb", value: 78, amount: "€1,460" },
];
const CHART_WIDTH = 300;
const CHART_HEIGHT = 120;
// Top margin the value labels live in - points never reach y=0, so a label above the
// highest point never clips out of the viewBox.
const CHART_LABEL_MARGIN = 22;
const chartCoords = CHART_POINTS.map((point, i) => ({
  ...point,
  x: (i / (CHART_POINTS.length - 1)) * CHART_WIDTH,
  y: CHART_HEIGHT - (point.value / 100) * (CHART_HEIGHT - CHART_LABEL_MARGIN),
}));

// Catmull-Rom -> cubic Bezier conversion so the trend line is an actual smooth curve
// through every point, not sharp straight-line segments.
function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length < 2) return "";
  let d = `M${points[0]!.x},${points[0]!.y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[i + 2] ?? p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
  }
  return d;
}
const smoothLine = smoothPath(chartCoords);
const areaPath = `${smoothLine} L${chartCoords[chartCoords.length - 1]!.x},${CHART_HEIGHT} L${chartCoords[0]!.x},${CHART_HEIGHT} Z`;

function PhaseHeader({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex shrink-0 items-center gap-2 text-sm font-semibold text-muted-foreground md:mb-6 md:text-base">
      <Icon className="size-4 text-primary md:size-5" />
      {children}
    </div>
  );
}

export function InsightsAnimation({ className }: { className?: string }) {
  const [phase, setPhase] = useState<Phase>("scan");

  useEffect(() => {
    const timer = setTimeout(() => {
      const nextIndex = (PHASES.indexOf(phase) + 1) % PHASES.length;
      setPhase(PHASES[nextIndex]);
    }, PHASE_DURATION_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  return (
    <div
      className={cn(
        "relative aspect-[3/2] w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-card/10 shadow-xl backdrop-blur-md",
        className,
      )}
    >
      <div className="absolute top-4 left-1/2 z-10 -translate-x-1/2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-[10px] font-semibold tracking-wide text-primary uppercase md:top-6 md:px-4 md:py-1.5 md:text-xs">
        {PHASE_LABELS[phase]}
      </div>

      {/* Phase 1: Scanning - a flat document with a gold beam sweeping down it,
          revealing text lines as it passes (docs/image.png's reference). */}
      <div
        className={cn(
          "absolute inset-0 flex flex-col items-center justify-center gap-4 p-8 pt-16 transition-opacity duration-500 md:p-12 md:pt-20",
          phase === "scan" ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <div className="relative flex w-full max-w-56 flex-col gap-3 overflow-hidden rounded-lg border border-border bg-background p-5 shadow-sm md:max-w-72 md:gap-3.5 md:p-7">
          {DOC_LINES.map((line, i) => (
            <div
              key={i}
              className={cn(
                "h-2 rounded-full bg-muted transition-opacity duration-500 md:h-2.5",
                line.divider && "my-1.5 h-px rounded-none bg-border",
                line.bold && "h-2.5 bg-primary/30 md:h-3",
              )}
              style={{
                width: line.width,
                opacity: phase === "scan" ? 1 : 0,
                transitionDelay:
                  phase === "scan" ? `${250 + i * 180}ms` : "0ms",
              }}
            />
          ))}
          {phase === "scan" && (
            <div
              aria-hidden
              className="animate-scan-sweep absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-transparent via-primary/70 to-transparent blur-sm"
            />
          )}
        </div>
        <p
          className="text-xs text-muted-foreground transition-opacity duration-500 md:text-sm"
          style={{
            opacity: phase === "scan" ? 1 : 0,
            transitionDelay: phase === "scan" ? "2000ms" : "0ms",
          }}
        >
          Reading every line of the bill…
        </p>
      </div>

      {/* Phase 2: Analyze - extracted fields appear one by one, then a confidence bar
          fills in. */}
      <div
        className={cn(
          "absolute inset-0 flex flex-col p-8 pt-16 transition-opacity duration-500 md:p-12 md:pt-20",
          phase === "analyze" ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <PhaseHeader icon={Sparkles}>Analyzing bill…</PhaseHeader>
        <div className="flex flex-1 flex-col justify-center gap-2.5 md:gap-3">
          {FIELDS.map((field, i) => (
            <div
              key={field.label}
              className="flex items-center justify-between rounded-lg border border-border bg-background px-3.5 py-2.5 text-xs transition-all duration-500 md:px-4 md:py-3 md:text-sm"
              style={{
                opacity: phase === "analyze" ? 1 : 0,
                transform:
                  phase === "analyze" ? "translateX(0)" : "translateX(8px)",
                transitionDelay:
                  phase === "analyze" ? `${200 + i * 200}ms` : "0ms",
              }}
            >
              <span className="text-muted-foreground">{field.label}</span>
              <span className="flex items-center gap-1.5 font-semibold text-foreground">
                {field.value}
                <Check className="size-3 text-primary md:size-3.5" />
              </span>
            </div>
          ))}
          <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground md:text-sm">
            <span>Confidence</span>
            <span className="font-semibold text-primary">94%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted md:h-2.5">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-1000 ease-out"
              style={{
                width: phase === "analyze" ? "94%" : "0%",
                transitionDelay: phase === "analyze" ? "1200ms" : "0ms",
              }}
            />
          </div>
        </div>
      </div>

      {/* Phase 3: Display insights - KPI-style tiles, echoing
          components/dashboard/kpi-tile.tsx's look without importing it (this is public
          marketing surface, kept self-contained). */}
      <div
        className={cn(
          "absolute inset-0 flex flex-col p-8 pt-16 transition-opacity duration-500 md:p-12 md:pt-20",
          phase === "insights"
            ? "opacity-100"
            : "pointer-events-none opacity-0",
        )}
      >
        <PhaseHeader icon={TrendingUp}>Key insights</PhaseHeader>
        <div className="flex flex-1 flex-col justify-center gap-2.5 md:gap-3.5">
          {INSIGHTS.map((item, i) => (
            <div
              key={item.label}
              className="flex w-full items-center justify-between gap-3 rounded-lg border border-primary/25 bg-primary/5 px-4 py-3 transition-all duration-500 md:px-5 md:py-4"
              style={{
                opacity: phase === "insights" ? 1 : 0,
                transform:
                  phase === "insights" ? "translateY(0)" : "translateY(6px)",
                transitionDelay:
                  phase === "insights" ? `${200 + i * 180}ms` : "0ms",
              }}
            >
              <span className="text-xs text-muted-foreground md:text-sm">
                {item.label}
              </span>
              <span className="shrink-0 text-lg font-extrabold text-primary md:text-2xl">
                {item.value}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Phase 4: Trends - a hand-rolled SVG line chart (spending trend), no chart
          library. The line "draws" itself via pathLength + stroke-dashoffset. */}
      <div
        className={cn(
          "absolute inset-0 flex flex-col p-8 pt-16 transition-opacity duration-500 md:p-12 md:pt-20",
          phase === "chart" ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <div className="mb-4 flex shrink-0 items-center justify-between md:mb-6">
          <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground md:text-base">
            <LineChart className="size-4 text-primary md:size-5" />
            Spending trend
          </div>
          <span
            className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary transition-opacity duration-500 md:text-sm"
            style={{
              opacity: phase === "chart" ? 1 : 0,
              transitionDelay: phase === "chart" ? "1800ms" : "0ms",
            }}
          >
            ↑ 18% vs last month
          </span>
        </div>
        <div className="flex flex-1 flex-col justify-center">
          <svg
            viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
            preserveAspectRatio="none"
            className="h-full w-full"
          >
            <defs>
              <linearGradient
                id="insights-chart-fill"
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop
                  offset="0%"
                  stopColor="var(--primary)"
                  stopOpacity="0.35"
                />
                <stop
                  offset="100%"
                  stopColor="var(--primary)"
                  stopOpacity="0"
                />
              </linearGradient>
            </defs>
            <path
              d={areaPath}
              fill="url(#insights-chart-fill)"
              style={{
                opacity: phase === "chart" ? 1 : 0,
                transition: "opacity 700ms ease-out",
                transitionDelay: phase === "chart" ? "700ms" : "0ms",
              }}
            />
            <path
              d={smoothLine}
              fill="none"
              stroke="var(--primary)"
              strokeWidth="1"
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={1}
              style={{
                strokeDasharray: 1,
                strokeDashoffset: phase === "chart" ? 0 : 1,
                transition: "stroke-dashoffset 1400ms ease-out",
              }}
            />
            {chartCoords.map((p, i) => (
              <g
                key={p.label}
                style={{
                  opacity: phase === "chart" ? 1 : 0,
                  transition: "opacity 300ms ease-out",
                  transitionDelay:
                    phase === "chart" ? `${100 + i * 220}ms` : "0ms",
                }}
              >
                <circle cx={p.x} cy={p.y} r="0" fill="var(--primary)" />
                <text
                  x={p.x}
                  y={p.y - 8}
                  textAnchor={
                    i === 0
                      ? "start"
                      : i === chartCoords.length - 1
                        ? "end"
                        : "middle"
                  }
                  fontSize="4"
                  fontWeight="900"
                  fill="var(--primary)"
                >
                  {p.amount}
                </text>
              </g>
            ))}
          </svg>
          <div className="mt-2 flex justify-between text-[1px] text-muted-foreground md:text-xs">
            {CHART_POINTS.map((point) => (
              <span key={point.label}>{point.label}</span>
            ))}
          </div>
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-4 flex items-center justify-center gap-2 md:bottom-6">
        {PHASES.map((p) => (
          <span
            key={p}
            className={cn(
              "size-1.5 rounded-full transition-colors duration-300 md:size-2",
              phase === p ? "bg-primary" : "bg-border",
            )}
          />
        ))}
      </div>
    </div>
  );
}
