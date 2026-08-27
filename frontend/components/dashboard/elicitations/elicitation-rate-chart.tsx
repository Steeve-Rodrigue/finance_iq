"use client";

import ReactECharts from "echarts-for-react";
import { useMemo } from "react";

import { ChartCard } from "@/components/dashboard/overview/chart-card";
import type { ElicitationRatePoint } from "@/lib/api";
import { useChartColors, withAlpha } from "@/lib/chart-theme";

function formatMonthTick(period: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "2-digit",
  }).format(new Date(period));
}

type ElicitationRateChartProps = {
  data: ElicitationRatePoint[];
  className?: string;
};

// frontend/CLAUDE.md's Elicitations "elicitation rate over time" chart: line chart by month -
// should trend down as the agent gets better at resolving bills on its own. Gradient area
// fill + crosshair tooltip + always-on point labels, same treatment as every other trend line
// in this app (spending-trend-chart.tsx etc.).
export function ElicitationRateChart({
  data,
  className,
}: ElicitationRateChartProps) {
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
          `${value} elicitation${value === 1 ? "" : "s"}`,
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
      title="Elicitation rate"
      subtitle="New elicitations, by month"
      className={className}
    >
      {data.length === 0 ? (
        <div className="flex h-[220px] items-center justify-center text-xs text-muted-foreground">
          No elicitations yet
        </div>
      ) : (
        <ReactECharts option={option} style={{ height: 220 }} notMerge />
      )}
    </ChartCard>
  );
}
