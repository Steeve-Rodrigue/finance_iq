"use client";

import ReactECharts from "echarts-for-react";
import { useMemo } from "react";

import { ChartCard } from "@/components/dashboard/overview/chart-card";
import type { BoxplotStats } from "@/lib/api";
import { useChartColors, withAlpha } from "@/lib/chart-theme";
import { formatCurrency } from "@/lib/format";

type SpendingBoxplotChartProps = {
  data: BoxplotStats[];
  className?: string;
};

function formatMonthTick(month: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "2-digit",
  }).format(new Date(month));
}

// Replaces the Recurring bills table in Detections. ECharts native `boxplot` series - one box
// per month, [min, Q1, median, Q3, max] per backend/app/services/analytics/spend_service.py's
// _build_boxplot (Tukey's method: Q1/Q3 are the median of the lower/upper half, not a
// linear-interpolation percentile). Shows how spread out bill amounts are within a month, not
// just their sum - a wide box means bill sizes varied a lot that month, a tall whisker means a
// single outlier bill dominated it.
export function SpendingBoxplotChart({
  data,
  className,
}: SpendingBoxplotChartProps) {
  const colors = useChartColors();

  const option = useMemo(
    () => ({
      grid: { left: 4, right: 16, top: 16, bottom: 28, containLabel: true },
      tooltip: {
        trigger: "item" as const,
        formatter: (p: { name: string; data: number[] }) =>
          [
            p.name,
            `Max: ${formatCurrency(p.data[4])}`,
            `Q3: ${formatCurrency(p.data[3])}`,
            `Median: ${formatCurrency(p.data[2])}`,
            `Q1: ${formatCurrency(p.data[1])}`,
            `Min: ${formatCurrency(p.data[0])}`,
          ].join("<br/>"),
      },
      xAxis: {
        type: "category" as const,
        data: data.map((d) => formatMonthTick(d.month)),
        boundaryGap: true,
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
      series: [
        {
          type: "boxplot" as const,
          data: data.map((d) => [
            Number(d.min),
            Number(d.q1),
            Number(d.median),
            Number(d.q3),
            Number(d.max),
          ]),
          boxWidth: [12, 28],
          itemStyle: {
            color: withAlpha(colors.primary, 0.15),
            borderColor: colors.primary,
            borderWidth: 1.5,
          },
          emphasis: {
            itemStyle: {
              borderWidth: 2,
              shadowBlur: 6,
              shadowColor: withAlpha(colors.primary, 0.3),
            },
          },
        },
      ],
    }),
    [data, colors],
  );

  return (
    <ChartCard
      title="Spending distribution"
      subtitle="Bill amounts by month"
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
