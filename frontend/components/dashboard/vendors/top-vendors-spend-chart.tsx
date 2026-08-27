"use client";

import ReactECharts from "echarts-for-react";
import { useMemo } from "react";

import { ChartCard } from "@/components/dashboard/overview/chart-card";
import type { VendorSpendBar } from "@/lib/api";
import { useChartColors } from "@/lib/chart-theme";
import { formatCurrency } from "@/lib/format";

type TopVendorsSpendChartProps = {
  data: VendorSpendBar[];
  className?: string;
};

// frontend/CLAUDE.md's Vendors "top vendors by spend" chart: horizontal bar, top 10.
// Reversed so the biggest vendor sits at the top of the list, matching how a ranked bar
// chart is normally read (best entry first, not last).
export function TopVendorsSpendChart({
  data,
  className,
}: TopVendorsSpendChartProps) {
  const colors = useChartColors();

  const option = useMemo(() => {
    const top10 = [...data].slice(0, 10).reverse();

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
        data: top10.map((v) => v.vendor_name),
        axisLine: { lineStyle: { color: colors.border } },
        axisTick: { show: false },
        axisLabel: { color: colors.mutedForeground, fontSize: 11 },
      },
      series: [
        {
          type: "bar" as const,
          data: top10.map((v) => Number(v.total)),
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
      title="Top vendors by spend"
      subtitle="Top 10 - total amount billed"
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
