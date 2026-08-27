"use client";

import ReactECharts from "echarts-for-react";
import { useMemo } from "react";

import { ChartCard } from "@/components/dashboard/overview/chart-card";
import type { VendorSpendingTrendPoint } from "@/lib/api";
import { useChartColors, withAlpha } from "@/lib/chart-theme";
import { formatCurrency } from "@/lib/format";

type VendorSpendingTrendChartProps = {
  data: VendorSpendingTrendPoint[];
  className?: string;
};

function formatPeriodLabel(period: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "2-digit",
  }).format(new Date(period));
}

// Vendor detail's "spending trend: line chart for this vendor only" from frontend/CLAUDE.md.
// No granularity/points controls here (unlike Overview's SpendingTrendChart) - the backend's
// vendor-detail endpoint returns a fixed series, not a filtrable one.
export function VendorSpendingTrendChart({
  data,
  className,
}: VendorSpendingTrendChartProps) {
  const colors = useChartColors();

  // Crosshair tooltip (axisPointer type "cross" + styled label) and the always-on amount
  // label per point follow docs/vendor's ECharts line-chart template - restyled with this
  // app's own theme colors (colors.primary/card) rather than the template's grey/black. Same
  // treatment as Overview's SpendingTrendChart, minus that chart's markPoint/Peak marker.
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
        data: data.map((p) => formatPeriodLabel(p.period)),
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
            formatter: (p: { value: number }) => formatCurrency(p.value),
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
      title="Spending trend"
      subtitle="Amount over time, this vendor"
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
