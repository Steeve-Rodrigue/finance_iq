"use client";

import ReactECharts from "echarts-for-react";
import { useMemo } from "react";

import { ChartCard } from "@/components/dashboard/overview/chart-card";
import type { VendorFrequencyBar } from "@/lib/api";
import { useChartColors } from "@/lib/chart-theme";

type TopVendorsFrequencyChartProps = {
  data: VendorFrequencyBar[];
  className?: string;
};

// frontend/CLAUDE.md's Vendors "top vendors by frequency" chart: horizontal bar, top 10 by
// bill count. Same layout as TopVendorsSpendChart but a distinct accent color (violet, not
// primary) so the two bar charts stay visually distinguishable side by side.
export function TopVendorsFrequencyChart({
  data,
  className,
}: TopVendorsFrequencyChartProps) {
  const colors = useChartColors();

  const option = useMemo(() => {
    const top10 = [...data].slice(0, 10).reverse();

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
        data: top10.map((v) => v.vendor_name),
        axisLine: { lineStyle: { color: colors.border } },
        axisTick: { show: false },
        axisLabel: { color: colors.mutedForeground, fontSize: 11 },
      },
      series: [
        {
          type: "bar" as const,
          data: top10.map((v) => v.bill_count),
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
      title="Top vendors by frequency"
      subtitle="Top 10 - bill count"
      className={className}
    >
      {data.length === 0 ? (
        <div className="flex h-[240px] items-center justify-center text-xs text-muted-foreground">
          No vendors yet
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
