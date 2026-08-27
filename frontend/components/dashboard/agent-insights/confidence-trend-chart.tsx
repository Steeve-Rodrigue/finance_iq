"use client";

import ReactECharts from "echarts-for-react";
import { useMemo } from "react";

import { ChartCard } from "@/components/dashboard/overview/chart-card";
import type { ConfidenceTrendPoint } from "@/lib/api";
import { useChartColors, withAlpha } from "@/lib/chart-theme";
import { formatPercent } from "@/lib/format";

type ConfidenceTrendChartProps = {
  data: ConfidenceTrendPoint[];
  className?: string;
};

function formatMonthTick(period: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "2-digit",
  }).format(new Date(period));
}

// avg_confidence is the raw 0-1 scale (see lib/api.ts's AgentInsightsKPIs comment) - x100
// before formatPercent, which expects 0-100. Null for a month with no bills.
function toPercent(value: string | null): number | null {
  return value === null ? null : Number(value) * 100;
}

// frontend/CLAUDE.md's Agent Insights "confidence trend over time" chart: line chart, AVG
// confidence by month. Crosshair tooltip + always-on point labels follow docs/vendor's
// ECharts line template, same treatment as the spending-trend charts.
export function ConfidenceTrendChart({
  data,
  className,
}: ConfidenceTrendChartProps) {
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
        valueFormatter: (value: number | null) =>
          value === null ? "No bills" : formatPercent(value, 1),
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
        min: 0,
        max: 100,
        splitLine: {
          lineStyle: { color: colors.border, type: "dashed" as const },
        },
        axisLabel: {
          color: colors.mutedForeground,
          fontSize: 11,
          formatter: (value: number) => formatPercent(value),
        },
        axisPointer: {
          label: {
            formatter: (params: { value: number }) =>
              formatPercent(params.value, 1),
          },
        },
      },
      series: [
        {
          type: "line" as const,
          data: data.map((p) => toPercent(p.avg_confidence)),
          connectNulls: true,
          smooth: true,
          symbol: "circle",
          symbolSize: 7,
          lineStyle: { color: colors.primary, width: 2 },
          itemStyle: {
            color: colors.primary,
            borderColor: colors.card,
            borderWidth: 2,
          },
          // Gradient area fill (top-to-bottom, saturated to transparent) - the canonical
          // ECharts line-chart look (echarts.apache.org/examples, "Line" category) rather
          // than a flat translucent fill.
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
            formatter: (p: { value: number | null }) =>
              p.value === null ? "" : formatPercent(p.value, 1),
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
      title="Confidence trend"
      subtitle="Average parser confidence, by month"
      className={className}
    >
      {data.length === 0 ? (
        <div className="flex h-[220px] items-center justify-center text-xs text-muted-foreground">
          No bills processed yet
        </div>
      ) : (
        <ReactECharts option={option} style={{ height: 220 }} notMerge />
      )}
    </ChartCard>
  );
}
