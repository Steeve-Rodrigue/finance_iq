"use client";

import ReactECharts from "echarts-for-react";
import { useMemo } from "react";

import { ChartCard } from "@/components/dashboard/overview/chart-card";
import { formatMonthLabel } from "@/lib/format";
import type { VelocityPoint } from "@/lib/api";
import { useChartColors } from "@/lib/chart-theme";
import { formatCurrency } from "@/lib/format";

type SpendingVelocityChartProps = {
  data: VelocityPoint[];
  className?: string;
};

// frontend/CLAUDE.md's Spend Analytics "spending velocity" chart: cumulative spend current
// month vs previous month, overlaid ("am I ahead or behind last month?"). Two lines sharing
// one day-of-month x-axis - a genuinely different comparison shape from this app's other
// dual-series charts (those pivot one series per category/vendor/item; this pivots one series
// per TIME PERIOD instead, both plotted against the same axis). Backend already accumulates
// both cumulatively day by day (backend/app/services/analytics/spend_service.py's
// _build_velocity) - no client-side running-total math needed here.
export function SpendingVelocityChart({
  data,
  className,
}: SpendingVelocityChartProps) {
  const colors = useChartColors();

  const option = useMemo(
    () => ({
      grid: { left: 4, right: 16, top: 8, bottom: 28, containLabel: true },
      tooltip: {
        trigger: "axis" as const,
        axisPointer: { type: "cross" as const, animation: false },
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
        data: data.map((p) => String(p.day_of_month)),
        boundaryGap: false,
        axisLine: { lineStyle: { color: colors.border } },
        axisTick: { show: false },
        axisLabel: { color: colors.mutedForeground, fontSize: 10 },
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
      series: [
        {
          name: formatMonthLabel(0, { includeYear: true }),
          type: "line" as const,
          smooth: true,
          symbol: "none" as const,
          lineStyle: { width: 2, color: colors.primary },
          itemStyle: { color: colors.primary },
          data: data.map((p) => Number(p.cumulative_current_month)),
        },
        {
          name: formatMonthLabel(-1),
          type: "line" as const,
          smooth: true,
          symbol: "none" as const,
          lineStyle: {
            width: 2,
            type: "dashed" as const,
            color: colors.mutedForeground,
          },
          itemStyle: { color: colors.mutedForeground },
          data: data.map((p) => Number(p.cumulative_previous_month)),
        },
      ],
    }),
    [data, colors],
  );

  return (
    <ChartCard
      title="Spending velocity"
      subtitle="This month vs. last month, cumulative"
      className={className}
    >
      {data.length === 0 ? (
        <div className="flex h-[240px] items-center justify-center text-xs text-muted-foreground">
          No spending recorded yet
        </div>
      ) : (
        <ReactECharts option={option} style={{ height: 240 }} notMerge />
      )}
    </ChartCard>
  );
}
