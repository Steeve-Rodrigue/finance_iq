"use client";

import ReactECharts from "echarts-for-react";
import { useMemo } from "react";

import { ChartCard } from "@/components/dashboard/overview/chart-card";
import type { UncategorizedTrendPoint } from "@/lib/api";
import { useChartColors } from "@/lib/chart-theme";

function formatMonthTick(period: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "2-digit",
  }).format(new Date(period));
}

type UncategorizedTrendChartProps = {
  data: UncategorizedTrendPoint[];
  className?: string;
};

// frontend/CLAUDE.md's Categories "uncategorized trend" chart: line chart over time, count of
// bills with no category assigned - should trend down as the categorizer agent improves.
// Crosshair tooltip + always-on point labels follow docs/vendor's ECharts line template, same
// treatment as the spending-trend charts (colors round-tripped through canvas in
// lib/chart-theme.ts so hover/emphasis doesn't crash on this app's oklch theme tokens).
export function UncategorizedTrendChart({
  data,
  className,
}: UncategorizedTrendChartProps) {
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
        valueFormatter: (value: number) =>
          `${value} bill${value === 1 ? "" : "s"}`,
      },
      xAxis: {
        type: "category" as const,
        data: data.map((p) => formatMonthTick(p.period)),
        boundaryGap: false,
        axisLine: { lineStyle: { color: colors.border } },
        axisTick: { show: false },
        axisLabel: { color: colors.mutedForeground, fontSize: 11 },
      },
      yAxis: {
        type: "value" as const,
        minInterval: 1,
        splitLine: {
          lineStyle: { color: colors.border, type: "dashed" as const },
        },
        axisLabel: { color: colors.mutedForeground, fontSize: 11 },
      },
      series: [
        {
          type: "line" as const,
          data: data.map((p) => p.count),
          smooth: true,
          symbol: "circle",
          symbolSize: 7,
          lineStyle: { color: colors.primary, width: 2 },
          itemStyle: {
            color: colors.primary,
            borderColor: colors.card,
            borderWidth: 2,
          },
          areaStyle: { color: colors.primary, opacity: 0.12 },
          emphasis: { scale: 1.4, itemStyle: { borderWidth: 3 } },
          label: {
            show: true,
            position: "top" as const,
            fontSize: 10,
            color: colors.mutedForeground,
          },
        },
      ],
    }),
    [data, colors],
  );

  return (
    <ChartCard
      title="Uncategorized trend"
      subtitle="Bills with no category, by month"
      className={className}
    >
      {data.length === 0 ? (
        <div className="flex h-[220px] items-center justify-center text-xs text-muted-foreground">
          No uncategorized bills recorded
        </div>
      ) : (
        <ReactECharts option={option} style={{ height: 220 }} notMerge />
      )}
    </ChartCard>
  );
}
