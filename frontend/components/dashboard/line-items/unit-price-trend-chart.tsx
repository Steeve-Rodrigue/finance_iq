"use client";

import ReactECharts from "echarts-for-react";
import { useMemo } from "react";

import { ChartCard } from "@/components/dashboard/overview/chart-card";
import type { UnitPriceTrendPoint } from "@/lib/api";
import { useChartColors } from "@/lib/chart-theme";
import { formatCurrency } from "@/lib/format";

type UnitPriceTrendChartProps = {
  data: UnitPriceTrendPoint[];
  className?: string;
};

// Same mixed multi-hue palette as top-vendors-chart.tsx/category-evolution-chart.tsx, so
// every "one color per series" chart in the app reads as one visual family.
const SERIES_COLORS = [
  "#f2b705", // gold
  "#7c5cbf", // violet
  "#3f9c6d", // green
  "#e2574c", // coral
  "#3f88c5", // blue
  "#e29c45", // amber
  "#5c8ca8", // steel
  "#a85c8c", // plum
  "#6ba85c", // moss
  "#c25c5c", // brick
];

function formatMonthTick(period: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "2-digit",
  }).format(new Date(period));
}

// frontend/CLAUDE.md's Line Items "unit price trend" chart: line per item over time - a
// "personal price index". Unlike category-evolution-chart.tsx's stacked area (parts of a
// whole), these are separate, non-stacked lines - each item's own price trajectory is what
// matters here, not a sum. Backend already scopes this to the same top-10 most-frequent items
// (backend/app/services/analytics/line_items_service.py), so no further capping needed - just
// pivoted from the API's tidy {common_name, period, avg_unit_price} rows into one series per
// item aligned to a shared, sorted set of periods.
export function UnitPriceTrendChart({
  data,
  className,
}: UnitPriceTrendChartProps) {
  const colors = useChartColors();

  const option = useMemo(() => {
    const periods = Array.from(new Set(data.map((d) => d.period))).sort();
    const itemNames = Array.from(new Set(data.map((d) => d.common_name)));
    const lookup = new Map(
      data.map((d) => [
        `${d.period}|${d.common_name}`,
        Number(d.avg_unit_price),
      ]),
    );

    return {
      grid: { left: 4, right: 16, top: 8, bottom: 28, containLabel: true },
      tooltip: {
        trigger: "axis" as const,
        axisPointer: {
          type: "cross" as const,
          animation: false,
          label: {
            backgroundColor: colors.primary,
            color: colors.card,
            borderWidth: 0,
            shadowBlur: 0,
            shadowOffsetX: 0,
            shadowOffsetY: 0,
          },
        },
        valueFormatter: (value: number) =>
          formatCurrency(value, { precise: true }),
      },
      legend: {
        bottom: 0,
        type: "scroll" as const,
        icon: "circle",
        itemWidth: 8,
        itemHeight: 8,
        textStyle: { color: colors.mutedForeground, fontSize: 11 },
      },
      xAxis: {
        type: "category" as const,
        data: periods.map(formatMonthTick),
        boundaryGap: false,
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
        axisPointer: {
          label: {
            formatter: (params: { value: number }) =>
              formatCurrency(params.value, { precise: true }),
          },
        },
      },
      series: itemNames.map((name, i) => ({
        name,
        type: "line" as const,
        smooth: true,
        symbol: "circle",
        symbolSize: 6,
        connectNulls: true,
        lineStyle: { width: 2, color: SERIES_COLORS[i % SERIES_COLORS.length] },
        itemStyle: { color: SERIES_COLORS[i % SERIES_COLORS.length] },
        emphasis: { focus: "series" as const },
        data: periods.map((p) => lookup.get(`${p}|${name}`) ?? null),
      })),
    };
  }, [data, colors]);

  return (
    <ChartCard
      title="Unit price trend"
      subtitle="Your personal price index, by item"
      className={className}
    >
      {data.length === 0 ? (
        <div className="flex h-[260px] items-center justify-center text-xs text-muted-foreground">
          No price history yet
        </div>
      ) : (
        <ReactECharts option={option} style={{ height: 260 }} notMerge />
      )}
    </ChartCard>
  );
}
