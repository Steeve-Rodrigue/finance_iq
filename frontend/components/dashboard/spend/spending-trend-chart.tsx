"use client";

import ReactECharts from "echarts-for-react";
import { useMemo } from "react";

import { ChartCard } from "@/components/dashboard/overview/chart-card";
import type { Granularity, TrendPoint } from "@/lib/api";
import { useChartColors, withAlpha } from "@/lib/chart-theme";
import { formatCurrency } from "@/lib/format";

type SpendingTrendChartProps = {
  data: TrendPoint[];
  granularity: Granularity;
  className?: string;
};

function formatPeriodLabel(period: string, granularity: Granularity): string {
  const date = new Date(period);
  if (granularity === "year") {
    return new Intl.DateTimeFormat("en-US", { year: "numeric" }).format(date);
  }
  if (granularity === "day" || granularity === "week") {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
    }).format(date);
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "2-digit",
  }).format(date);
}

// frontend/CLAUDE.md's Spend Analytics "spending trend" chart: line, filtrable. Unlike
// Overview's SpendingTrendChart, granularity is controlled by the page-top SpendFilters bar
// (part of the same global filter set as vendor/category/date range), not a control embedded
// in this card - so no Tabs here, just the chart. Same gradient-fill/crosshair/always-on-label
// treatment as every other trend line in this app.
export function SpendingTrendChart({
  data,
  granularity,
  className,
}: SpendingTrendChartProps) {
  const colors = useChartColors();

  const option = useMemo(
    () => ({
      grid: { left: 4, right: 16, top: 16, bottom: 4, containLabel: true },
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
        valueFormatter: (value: number) => formatCurrency(value),
      },
      xAxis: {
        type: "category" as const,
        data: data.map((p) => formatPeriodLabel(p.period, granularity)),
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
              formatCurrency(params.value),
          },
        },
      },
      series: [
        {
          type: "line" as const,
          data: data.map((p) => Number(p.total)),
          smooth: true,
          symbol: "circle",
          symbolSize: 7,
          lineStyle: { color: colors.primary, width: 2 },
          itemStyle: {
            color: colors.primary,
            borderColor: colors.card,
            borderWidth: 2,
          },
          areaStyle: {
            color: {
              type: "linear",
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: withAlpha(colors.primary, 0.35) },
                { offset: 1, color: withAlpha(colors.primary, 0) },
              ],
            },
          },
          emphasis: { scale: 1.4, itemStyle: { borderWidth: 3 } },
          label: {
            show: true,
            position: "top" as const,
            formatter: (p: { value: number }) => formatCurrency(p.value),
            fontSize: 10,
            color: colors.mutedForeground,
          },
        },
      ],
    }),
    [data, granularity, colors],
  );

  return (
    <ChartCard
      title="Spending trend"
      subtitle="Matching current filters"
      className={className}
    >
      {data.length === 0 ? (
        <div className="flex h-[220px] items-center justify-center text-xs text-muted-foreground">
          No spending recorded yet
        </div>
      ) : (
        <ReactECharts option={option} style={{ height: 220 }} notMerge />
      )}
    </ChartCard>
  );
}
