"use client";

import ReactECharts from "echarts-for-react";
import { useMemo } from "react";

import { ChartCard } from "@/components/dashboard/overview/chart-card";
import type { CategorySpendBar } from "@/lib/api";
import { useChartColors } from "@/lib/chart-theme";
import { formatCurrency } from "@/lib/format";

type SpendByCategoryChartProps = {
  data: CategorySpendBar[];
  className?: string;
};

// frontend/CLAUDE.md's Categories "spend by category" chart: bar chart sorted desc. Horizontal
// bar, same treatment as Vendors' top-vendors-spend-chart.tsx, since category names can run
// longer than fit a vertical bar's x-axis labels.
export function SpendByCategoryChart({
  data,
  className,
}: SpendByCategoryChartProps) {
  const colors = useChartColors();

  const option = useMemo(() => {
    const sorted = [...data]
      .sort((a, b) => Number(b.total) - Number(a.total))
      .reverse();

    return {
      grid: { left: 4, right: 24, top: 8, bottom: 4, containLabel: true },
      tooltip: {
        trigger: "axis" as const,
        axisPointer: { type: "shadow" as const },
        valueFormatter: (value: number) => formatCurrency(value),
      },
      xAxis: {
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
      yAxis: {
        type: "category" as const,
        data: sorted.map((c) => c.category_name),
        axisLine: { lineStyle: { color: colors.border } },
        axisTick: { show: false },
        axisLabel: { color: colors.mutedForeground, fontSize: 11 },
      },
      series: [
        {
          type: "bar" as const,
          data: sorted.map((c) => Number(c.total)),
          barMaxWidth: 18,
          // Full-track background bar (echarts.apache.org/examples, "Bar" category's
          // background-bar treatment) instead of a bare bar floating on empty space.
          showBackground: true,
          backgroundStyle: { color: colors.border, borderRadius: [0, 4, 4, 0] },
          itemStyle: { color: colors.primary, borderRadius: [0, 4, 4, 0] },
          label: {
            show: true,
            position: "right" as const,
            formatter: (p: { value: number }) => formatCurrency(p.value),
            fontSize: 10,
            color: colors.mutedForeground,
          },
        },
      ],
    };
  }, [data, colors]);

  return (
    <ChartCard
      title="Spend by category"
      subtitle="Sorted by total, high to low"
      className={className}
    >
      {data.length === 0 ? (
        <div className="flex h-[240px] items-center justify-center text-xs text-muted-foreground">
          No categorized spend yet
        </div>
      ) : (
        <ReactECharts
          option={option}
          style={{ height: Math.max(160, Math.min(data.length, 10) * 32) }}
          notMerge
        />
      )}
    </ChartCard>
  );
}
