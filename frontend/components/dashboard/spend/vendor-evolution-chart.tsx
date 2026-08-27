"use client";

import ReactECharts from "echarts-for-react";
import { useMemo } from "react";

import { ChartCard } from "@/components/dashboard/overview/chart-card";
import type { Granularity, VendorEvolutionPoint } from "@/lib/api";
import { useChartColors, withAlpha } from "@/lib/chart-theme";
import { formatCurrency } from "@/lib/format";

type VendorEvolutionChartProps = {
  data: VendorEvolutionPoint[];
  granularity: Granularity;
  className?: string;
};

// Same 5-color palette as spend/category-evolution-chart.tsx - backend already caps this at
// top 5 vendors (backend/app/repos/analytics/spend_repo.py's get_vendor_evolution top_n=5).
const SERIES_COLORS = [
  "#f2b705", // gold
  "#7c5cbf", // violet
  "#3f9c6d", // green
  "#e2574c", // coral
  "#3f88c5", // blue
];

function formatTick(period: string, granularity: Granularity): string {
  const date = new Date(period);
  if (granularity === "year") {
    return new Intl.DateTimeFormat("en-US", { year: "numeric" }).format(date);
  }
  if (granularity === "month") {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      year: "2-digit",
    }).format(date);
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

// frontend/CLAUDE.md's Spend Analytics "vendor spending evolution" chart: top 5 vendors,
// compared over time. Grouped bar chart per docs/vendor's "Bar Chart with Axis Breaks"
// template (multiple named `type: "bar"` series sharing one category x-axis = clustered bars
// per category) - one time bucket per x-axis tick, one bar per vendor at each tick, legend
// under the graph. The template's axis-break mechanism itself isn't used (that's for a dataset
// with an extreme value gap to compress on the y-axis - spend totals here don't need it).
// `granularity` follows the page-top SpendFilters selector like every other chart on this page
// (backend/app/repos/analytics/spend_repo.py's get_vendor_evolution buckets by it), rather than
// being fixed to month.
export function VendorEvolutionChart({
  data,
  granularity,
  className,
}: VendorEvolutionChartProps) {
  const colors = useChartColors();

  const option = useMemo(() => {
    const periods = Array.from(new Set(data.map((d) => d.period))).sort();
    const vendorNames = Array.from(new Set(data.map((d) => d.vendor_name)));
    const lookup = new Map(
      data.map((d) => [`${d.period}|${d.vendor_name}`, Number(d.total)]),
    );

    return {
      // Extra bottom padding (vs. this app's usual 28) so the x-axis tick labels and the
      // legend below them each get their own row instead of overlapping.
      grid: { left: 4, right: 16, top: 8, bottom: 44, containLabel: true },
      tooltip: {
        trigger: "axis" as const,
        axisPointer: { type: "shadow" as const },
        valueFormatter: (value: number) => formatCurrency(value),
      },
      legend: {
        bottom: 0,
        icon: "circle",
        itemWidth: 8,
        itemHeight: 8,
        textStyle: { color: colors.mutedForeground, fontSize: 11 },
      },
      xAxis: {
        type: "category" as const,
        data: periods.map((p) => formatTick(p, granularity)),
        axisLine: { lineStyle: { color: colors.border } },
        axisTick: { show: false },
        axisLabel: { color: colors.mutedForeground, fontSize: 11 },
      },
      yAxis: {
        type: "value" as const,
        splitLine: {
          lineStyle: { color: colors.border, type: "dashed" as const },
        },
        axisLabel: {
          color: colors.mutedForeground,
          fontSize: 11,
          formatter: (value: number) => formatCurrency(value),
        },
      },
      series: vendorNames.map((name, i) => ({
        name,
        type: "bar" as const,
        showBackground: true,
        backgroundStyle: { color: withAlpha(colors.border, 0.15) },
        itemStyle: {
          color: SERIES_COLORS[i % SERIES_COLORS.length],
          borderRadius: [3, 3, 0, 0],
        },
        emphasis: { focus: "series" as const },
        data: periods.map((p) => lookup.get(`${p}|${name}`) ?? 0),
      })),
    };
  }, [data, granularity, colors]);

  return (
    <ChartCard
      title="Vendor spending evolution"
      subtitle={`Top 5 vendors, by ${granularity}`}
      className={className}
    >
      {data.length === 0 ? (
        <div className="flex h-[260px] items-center justify-center text-xs text-muted-foreground">
          No spend history yet
        </div>
      ) : (
        <ReactECharts option={option} style={{ height: 260 }} notMerge />
      )}
    </ChartCard>
  );
}
