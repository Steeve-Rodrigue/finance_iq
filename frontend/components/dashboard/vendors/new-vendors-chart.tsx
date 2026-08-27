"use client";

import ReactECharts from "echarts-for-react";
import { useMemo } from "react";

import { ChartCard } from "@/components/dashboard/overview/chart-card";
import type { NewVendorsPoint } from "@/lib/api";
import { useChartColors } from "@/lib/chart-theme";

type NewVendorsChartProps = {
  data: NewVendorsPoint[];
  className?: string;
};

function formatMonthTick(period: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "2-digit",
  }).format(new Date(period));
}

// frontend/CLAUDE.md's Vendors "new vendors over time" chart: line chart, first created_at
// per vendor grouped by month (docs/vendor's `new_vendors_over_time`).
export function NewVendorsChart({ data, className }: NewVendorsChartProps) {
  const colors = useChartColors();

  const option = useMemo(
    () => ({
      grid: { left: 4, right: 16, top: 16, bottom: 4, containLabel: true },
      tooltip: {
        trigger: "axis" as const,
        valueFormatter: (value: number) =>
          `${value} new vendor${value === 1 ? "" : "s"}`,
      },
      xAxis: {
        type: "category" as const,
        data: data.map((p) => formatMonthTick(p.period)),
        boundaryGap: false,
        axisLine: { lineStyle: { color: colors.border } },
        axisTick: { show: false },
        axisLabel: { color: colors.mutedForeground, fontSize: 11 },
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
          type: "line" as const,
          data: data.map((p) => p.count),
          smooth: true,
          symbol: "circle",
          symbolSize: 7,
          lineStyle: { color: "#3f9c6d", width: 2 },
          itemStyle: {
            color: "#3f9c6d",
            borderColor: colors.card,
            borderWidth: 2,
          },
          areaStyle: { color: "#3f9c6d", opacity: 0.12 },
          emphasis: { scale: 1.4, itemStyle: { borderWidth: 3 } },
        },
      ],
    }),
    [data, colors],
  );

  return (
    <ChartCard
      title="New vendors over time"
      subtitle="First bill per vendor, by month"
      className={className}
    >
      {data.length === 0 ? (
        <div className="flex h-[220px] items-center justify-center text-xs text-muted-foreground">
          No vendors yet
        </div>
      ) : (
        <ReactECharts option={option} style={{ height: 220 }} notMerge />
      )}
    </ChartCard>
  );
}
