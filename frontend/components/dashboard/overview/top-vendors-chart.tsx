"use client";

import ReactECharts from "echarts-for-react";
import { useMemo } from "react";

import type { VendorSpend } from "@/lib/api";
import { useChartColors } from "@/lib/chart-theme";
import { formatCurrency } from "@/lib/format";

import { ChartCard } from "./chart-card";

type TopVendorsChartProps = {
  data: VendorSpend[];
  className?: string;
};

// Mixed multi-hue palette (not the amber-only family used by spending-by-category-chart.tsx)
// so the two pie charts stay visually distinct from each other at a glance.
const SLICE_COLORS = [
  "#f2b705", // gold
  "#7c5cbf", // violet
  "#3f9c6d", // green
  "#e2574c", // coral
  "#3f88c5", // blue
];

export function TopVendorsChart({ data, className }: TopVendorsChartProps) {
  const colors = useChartColors();

  // Nightingale/rose chart - petal length (not just angle) scales with spend, so the
  // biggest vendor visually dominates. Memoized: `option` must keep a stable reference
  // across renders that don't actually change the data/colors (e.g. a hover-triggered
  // re-render elsewhere on the page) - with `notMerge`, a fresh object every render forces
  // ECharts to fully re-init and replay its entry animation, which reads as the chart
  // flickering/disappearing on interaction.
  const option = useMemo(() => {
    const top5 = [...data].slice(0, 5);

    return {
      tooltip: {
        trigger: "item" as const,
        valueFormatter: (value: number) => formatCurrency(value),
      },
      legend: {
        bottom: 0,
        orient: "horizontal" as const,
        icon: "circle",
        itemWidth: 8,
        itemHeight: 8,
        textStyle: { color: colors.mutedForeground, fontSize: 11 },
      },
      series: [
        {
          type: "pie" as const,
          radius: ["22%", "82%"],
          center: ["50%", "40%"],
          roseType: "radius" as const,
          itemStyle: {
            borderColor: colors.card,
            borderWidth: 1,
            shadowBlur: 8,
            shadowColor: "rgba(0, 0, 0, 0.25)",
          },
          label: { show: false },
          labelLine: { show: false },
          data: top5.map((v, i) => ({
            name: v.vendor_name,
            value: Number(v.total),
            itemStyle: { color: SLICE_COLORS[i % SLICE_COLORS.length] },
          })),
        },
      ],
    };
  }, [data, colors]);

  return (
    <ChartCard
      title="Top grocery vendors"
      subtitle="By total spend - courses category"
      className={className}
    >
      {data.length === 0 ? (
        <div className="flex h-[220px] items-center justify-center text-xs text-muted-foreground">
          No grocery bills yet
        </div>
      ) : (
        <ReactECharts option={option} style={{ height: 220 }} notMerge />
      )}
    </ChartCard>
  );
}
