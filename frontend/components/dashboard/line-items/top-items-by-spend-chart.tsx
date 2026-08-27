"use client";

import ReactECharts from "echarts-for-react";
import { useMemo } from "react";

import { ChartCard } from "@/components/dashboard/overview/chart-card";
import type { ItemSpend } from "@/lib/api";
import { useChartColors } from "@/lib/chart-theme";
import { formatCurrency } from "@/lib/format";

type TopItemsBySpendChartProps = {
  data: ItemSpend[];
  className?: string;
};

// Same 10-color palette as unit-price-trend-chart.tsx/most-frequent-items-chart.tsx, so every
// chart on this page reads as one visual family.
const SLICE_COLORS = [
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

// frontend/CLAUDE.md's Line Items "top items by total spend" chart: SUM(line_total).
// Nightingale/rose pie, same treatment as MostFrequentItemsChart - petal length scales with
// spend, so the highest-spend item visually dominates. Backend already returns this sorted
// desc and capped at 10 (backend/app/services/analytics/line_items_service.py's
// _TOP_ITEMS_LIMIT).
export function TopItemsBySpendChart({
  data,
  className,
}: TopItemsBySpendChartProps) {
  const colors = useChartColors();

  const option = useMemo(
    () => ({
      tooltip: {
        trigger: "item" as const,
        valueFormatter: (value: number) => formatCurrency(value),
      },
      legend: {
        bottom: 0,
        left: "5%",
        right: "5%",
        orient: "horizontal" as const,
        icon: "circle",
        itemWidth: 8,
        itemHeight: 8,
        textStyle: { color: colors.mutedForeground, fontSize: 11 },
      },
      series: [
        {
          type: "pie" as const,
          radius: ["16%", "52%"],
          center: ["50%", "34%"],
          roseType: "radius" as const,
          itemStyle: {
            borderColor: colors.card,
            borderWidth: 1,
            shadowBlur: 8,
            shadowColor: "rgba(0, 0, 0, 0.25)",
          },
          label: {
            show: true,
            position: "outside" as const,
            formatter: (p: { value: number }) => formatCurrency(p.value),
            fontSize: 10,
            color: colors.mutedForeground,
          },
          labelLine: {
            show: true,
            length: 8,
            length2: 8,
            lineStyle: { color: colors.border },
          },
          data: data.map((item, i) => ({
            name: item.common_name,
            value: Number(item.total),
            itemStyle: { color: SLICE_COLORS[i % SLICE_COLORS.length] },
          })),
        },
      ],
    }),
    [data, colors],
  );

  return (
    <ChartCard
      title="Top items by spend"
      subtitle="Top 10 by total amount"
      className={className}
    >
      {data.length === 0 ? (
        <div className="flex h-[240px] items-center justify-center text-xs text-muted-foreground">
          No line items yet
        </div>
      ) : (
        // Taller on mobile, not just narrower: up to 10 legend entries wrap onto more rows
        // at phone widths, and the legend has no fixed height of its own in ECharts - the
        // surrounding container has to be tall enough to fit however many rows it wraps to,
        // or the last ones get clipped/overlap the pie above them.
        <div className="h-[340px] md:h-[280px]">
          <ReactECharts option={option} style={{ height: "100%" }} notMerge />
        </div>
      )}
    </ChartCard>
  );
}
