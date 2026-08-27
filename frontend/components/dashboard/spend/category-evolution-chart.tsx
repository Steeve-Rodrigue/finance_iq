"use client";

import ReactECharts from "echarts-for-react";
import { useMemo } from "react";

import { ChartCard } from "@/components/dashboard/overview/chart-card";
import type { CategoryEvolutionPoint } from "@/lib/api";
import { useChartColors } from "@/lib/chart-theme";
import { formatCurrency } from "@/lib/format";

type CategoryEvolutionChartProps = {
  data: CategoryEvolutionPoint[];
  className?: string;
};

// Same mixed multi-hue palette as categories/category-evolution-chart.tsx (this is the same
// concept, just reused on a different page - GET /analytics/spend returns its own
// category_evolution field rather than sharing the Categories page's fetch).
const SERIES_COLORS = [
  "#f2b705", // gold
  "#7c5cbf", // violet
  "#3f9c6d", // green
  "#e2574c", // coral
  "#3f88c5", // blue
];

function formatMonthTick(period: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "2-digit",
  }).format(new Date(period));
}

// frontend/CLAUDE.md's Spend Analytics "category evolution" chart: stacked area chart by
// month. Same pivot-from-tidy-rows technique as categories/category-evolution-chart.tsx.
export function CategoryEvolutionChart({
  data,
  className,
}: CategoryEvolutionChartProps) {
  const colors = useChartColors();

  const option = useMemo(() => {
    const periods = Array.from(new Set(data.map((d) => d.period))).sort();
    const categoryNames = Array.from(new Set(data.map((d) => d.category_name)));
    const lookup = new Map(
      data.map((d) => [`${d.period}|${d.category_name}`, Number(d.total)]),
    );

    return {
      grid: { left: 4, right: 16, top: 8, bottom: 28, containLabel: true },
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
      legend: {
        bottom: 0,
        icon: "circle",
        itemWidth: 8,
        itemHeight: 8,
        textStyle: { color: colors.mutedForeground, fontSize: 11 },
      },
      xAxis: {
        type: "category" as const,
        data: periods.map(formatMonthTick),
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
      series: categoryNames.map((name, i) => ({
        name,
        type: "line" as const,
        stack: "total",
        smooth: true,
        symbol: "none" as const,
        areaStyle: { opacity: 0.75 },
        lineStyle: { width: 1, color: SERIES_COLORS[i % SERIES_COLORS.length] },
        itemStyle: { color: SERIES_COLORS[i % SERIES_COLORS.length] },
        emphasis: { focus: "series" as const },
        data: periods.map((p) => lookup.get(`${p}|${name}`) ?? 0),
      })),
    };
  }, [data, colors]);

  return (
    <ChartCard
      title="Category evolution"
      subtitle="Spend by category, by month"
      className={className}
    >
      {data.length === 0 ? (
        <div className="flex h-[260px] items-center justify-center text-xs text-muted-foreground">
          No spend history yet
        </div>
      ) : (
        <ReactECharts option={option} style={{ height: 260 }} notMerge />
      )}
    </ChartCard>
  );
}
