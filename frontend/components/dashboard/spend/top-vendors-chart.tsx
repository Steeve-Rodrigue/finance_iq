"use client";

import ReactECharts from "echarts-for-react";
import { useMemo } from "react";

import { ChartCard } from "@/components/dashboard/overview/chart-card";
import type { VendorSpend } from "@/lib/api";
import { useChartColors } from "@/lib/chart-theme";
import { formatCurrency } from "@/lib/format";

type TopVendorsChartProps = {
  data: VendorSpend[];
  className?: string;
};

// frontend/CLAUDE.md's Spend Analytics "top vendors" chart: horizontal bar, filtrable.
// Backend already returns this sorted desc and capped at 10
// (backend/app/repos/analytics/spend_repo.py's get_top_vendors limit=10), reversed here for
// the horizontal bar's top-to-bottom reading order. Same treatment as vendors/
// top-vendors-spend-chart.tsx.
export function TopVendorsChart({ data, className }: TopVendorsChartProps) {
  const colors = useChartColors();

  const option = useMemo(() => {
    const reversed = [...data].reverse();

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
        data: reversed.map((v) => v.vendor_name),
        axisLine: { lineStyle: { color: colors.border } },
        axisTick: { show: false },
        axisLabel: { color: colors.mutedForeground, fontSize: 11 },
      },
      series: [
        {
          type: "bar" as const,
          data: reversed.map((v) => Number(v.total)),
          barMaxWidth: 18,
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
      title="Top vendors"
      subtitle="Top 10, matching current filters"
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
