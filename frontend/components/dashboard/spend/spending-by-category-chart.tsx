"use client";

import ReactECharts from "echarts-for-react";
import { useMemo } from "react";

import { ChartCard } from "@/components/dashboard/overview/chart-card";
import type { CategorySpend } from "@/lib/api";
import { useChartColors } from "@/lib/chart-theme";
import { formatCurrency } from "@/lib/format";

type SpendingByCategoryChartProps = {
  data: CategorySpend[];
  className?: string;
};

// Same mixed multi-hue palette as overview/spending-by-category-chart.tsx (this is the same
// concept, filtrable here rather than fixed to Overview's unfiltered totals).
const SLICE_COLORS = [
  "#f2b705", // gold
  "#7c5cbf", // violet
  "#3f9c6d", // green
  "#e2574c", // coral
  "#3f88c5", // blue
];

// frontend/CLAUDE.md's Spend Analytics "spending by category" chart: pie/donut, filtrable.
// Same nightingale/rose treatment as Overview's SpendingByCategoryChart.
export function SpendingByCategoryChart({
  data,
  className,
}: SpendingByCategoryChartProps) {
  const colors = useChartColors();

  const option = useMemo(
    () => ({
      tooltip: {
        trigger: "item" as const,
        valueFormatter: (value: number) => formatCurrency(value),
      },
      legend: {
        bottom: 0,
        orient: "horizontal" as const,
        icon: "circle",
        itemWidth: 8,
        itemHeight: 8,
        textStyle: { color: colors.mutedForeground, fontSize: 11 },
      },
      series: [
        {
          type: "pie" as const,
          radius: ["22%", "82%"],
          center: ["50%", "40%"],
          roseType: "radius" as const,
          itemStyle: {
            borderColor: colors.card,
            borderWidth: 1,
            shadowBlur: 8,
            shadowColor: "rgba(0, 0, 0, 0.25)",
          },
          label: { show: false },
          labelLine: { show: false },
          data: data.map((c, i) => ({
            name: c.category_name,
            value: Number(c.total),
            itemStyle: { color: SLICE_COLORS[i % SLICE_COLORS.length] },
          })),
        },
      ],
    }),
    [data, colors],
  );

  return (
    <ChartCard
      title="Spending by category"
      subtitle="Matching current filters"
      className={className}
    >
      {data.length === 0 ? (
        <div className="flex h-[220px] items-center justify-center text-xs text-muted-foreground">
          No categorized spend yet
        </div>
      ) : (
        <ReactECharts option={option} style={{ height: 220 }} notMerge />
      )}
    </ChartCard>
  );
}
