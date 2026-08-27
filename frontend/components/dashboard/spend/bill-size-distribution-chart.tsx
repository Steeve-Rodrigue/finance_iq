"use client";

import ReactECharts from "echarts-for-react";
import { useMemo } from "react";

import { ChartCard } from "@/components/dashboard/overview/chart-card";
import type { BillSizeHistogramBucket } from "@/lib/api";
import { useChartColors } from "@/lib/chart-theme";
import { formatCurrency } from "@/lib/format";

type BillSizeDistributionChartProps = {
  data: BillSizeHistogramBucket[];
  className?: string;
};

// frontend/CLAUDE.md's Spend Analytics "bill size distribution" chart: histogram of
// total_amount values (many small bills? few large ones?). Unlike Agent Insights' confidence
// histogram (a fixed 0-1 domain), this bucket range is min/max-based on the actual filtered
// bills (backend/app/services/analytics/spend_service.py's _build_histogram), so the bucket
// width/labels change with the current filters.
export function BillSizeDistributionChart({
  data,
  className,
}: BillSizeDistributionChartProps) {
  const colors = useChartColors();
  const totalBills = useMemo(
    () => data.reduce((sum, b) => sum + b.count, 0),
    [data],
  );

  const option = useMemo(
    () => ({
      grid: { left: 4, right: 16, top: 16, bottom: 4, containLabel: true },
      tooltip: {
        trigger: "axis" as const,
        axisPointer: { type: "shadow" as const },
        valueFormatter: (value: number) =>
          `${value} bill${value === 1 ? "" : "s"}`,
      },
      xAxis: {
        type: "category" as const,
        data: data.map(
          (b) =>
            `${formatCurrency(b.range_start)}-${formatCurrency(b.range_end)}`,
        ),
        axisLine: { lineStyle: { color: colors.border } },
        axisTick: { show: false },
        axisLabel: {
          color: colors.mutedForeground,
          fontSize: 10,
          rotate: 45,
        },
      },
      yAxis: {
        type: "value" as const,
        minInterval: 1,
        splitLine: {
          lineStyle: { color: colors.border, type: "dashed" as const },
        },
        axisLabel: { color: colors.mutedForeground, fontSize: 11 },
      },
      series: [
        {
          type: "bar" as const,
          data: data.map((b) => b.count),
          barMaxWidth: 28,
          showBackground: true,
          backgroundStyle: { color: colors.border, borderRadius: [4, 4, 0, 0] },
          itemStyle: { color: colors.primary, borderRadius: [4, 4, 0, 0] },
          label: {
            show: true,
            position: "top" as const,
            formatter: (p: { value: number }) => (p.value > 0 ? p.value : ""),
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
      title="Bill size distribution"
      subtitle="How your bill amounts are spread out"
      className={className}
    >
      {totalBills === 0 ? (
        <div className="flex h-[220px] items-center justify-center text-xs text-muted-foreground">
          No bills yet
        </div>
      ) : (
        <ReactECharts option={option} style={{ height: 220 }} notMerge />
      )}
    </ChartCard>
  );
}
