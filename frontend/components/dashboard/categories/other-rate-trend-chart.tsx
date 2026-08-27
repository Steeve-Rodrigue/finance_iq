"use client";

import ReactECharts from "echarts-for-react";
import { useMemo } from "react";

import { ChartCard } from "@/components/dashboard/overview/chart-card";
import type { OtherRateTrendPoint } from "@/lib/api";
import { useChartColors } from "@/lib/chart-theme";
import { formatPercent } from "@/lib/format";

function formatMonthTick(period: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "2-digit",
  }).format(new Date(period));
}

type OtherRateTrendChartProps = {
  data: OtherRateTrendPoint[];
  className?: string;
};

// frontend/CLAUDE.md's Categories "'Other' rate over time" chart: line chart - rising means a
// taxonomy gap or a categorizer-model problem. Crosshair tooltip + always-on point labels
// follow docs/vendor's ECharts line template, same treatment as the spending-trend charts.
export function OtherRateTrendChart({
  data,
  className,
}: OtherRateTrendChartProps) {
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
        valueFormatter: (value: number) => formatPercent(value, 1),
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
          data: data.map((p) => Number(p.other_rate)),
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
            formatter: (p: { value: number }) => formatPercent(p.value, 1),
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
      title="“Other” rate over time"
      subtitle="Rising means a taxonomy gap"
      className={className}
    >
      {data.length === 0 ? (
        <div className="flex h-[220px] items-center justify-center text-xs text-muted-foreground">
          No data yet
        </div>
      ) : (
        <ReactECharts option={option} style={{ height: 220 }} notMerge />
      )}
    </ChartCard>
  );
}
