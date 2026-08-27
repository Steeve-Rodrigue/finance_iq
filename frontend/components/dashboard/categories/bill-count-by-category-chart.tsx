"use client";

import ReactECharts from "echarts-for-react";
import { useMemo } from "react";

import { ChartCard } from "@/components/dashboard/overview/chart-card";
import type { CategoryCount } from "@/lib/api";
import { useChartColors } from "@/lib/chart-theme";

type BillCountByCategoryChartProps = {
  data: CategoryCount[];
  className?: string;
};

// frontend/CLAUDE.md's Categories "bill count by category" chart: bar chart. Same horizontal
// layout as SpendByCategoryChart but a distinct accent (violet, not primary) and count-based
// values, sorted desc by bill count.
export function BillCountByCategoryChart({
  data,
  className,
}: BillCountByCategoryChartProps) {
  const colors = useChartColors();

  const option = useMemo(() => {
    const sorted = [...data]
      .sort((a, b) => b.bill_count - a.bill_count)
      .reverse();

    return {
      grid: { left: 4, right: 24, top: 8, bottom: 4, containLabel: true },
      tooltip: {
        trigger: "axis" as const,
        axisPointer: { type: "shadow" as const },
        valueFormatter: (value: number) =>
          `${value} bill${value === 1 ? "" : "s"}`,
      },
      xAxis: {
        type: "value" as const,
        minInterval: 1,
        splitLine: {
          lineStyle: { color: colors.border, type: "dashed" as const },
        },
        axisLabel: { color: colors.mutedForeground, fontSize: 11 },
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
          data: sorted.map((c) => c.bill_count),
          barMaxWidth: 18,
          // Full-track background bar (echarts.apache.org/examples, "Bar" category's
          // background-bar treatment) instead of a bare bar floating on empty space.
          showBackground: true,
          backgroundStyle: { color: colors.border, borderRadius: [0, 4, 4, 0] },
          itemStyle: { color: "#7c5cbf", borderRadius: [0, 4, 4, 0] },
          label: {
            show: true,
            position: "right" as const,
            fontSize: 10,
            color: colors.mutedForeground,
          },
        },
      ],
    };
  }, [data, colors]);

  return (
    <ChartCard
      title="Bill count by category"
      subtitle="Sorted by count, high to low"
      className={className}
    >
      {data.length === 0 ? (
        <div className="flex h-[240px] items-center justify-center text-xs text-muted-foreground">
          No categorized bills yet
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
