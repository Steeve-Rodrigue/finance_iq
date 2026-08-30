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

// Same mixed multi-hue palette as top-vendors-chart.tsx/spending-by-category-chart.tsx, so
// every "one color per category/vendor" chart in the app reads as one visual family.
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

// docs/a's ECharts "Income of Germany and France since 1950" template - one unstacked line
// per series with no point markers and hover highlighting the whole series. Adapted from that
// template's per-country dataset+transform (irrelevant here - the API already returns a tidy
// {period, category_name, total} list, so the per-category series are pivoted out in JS
// instead) to one line per category, replacing the chart's previous stacked-area look. Series
// are named via a bottom legend (this app's own convention - see category-momentum-chart.tsx/
// spending-by-category-chart.tsx) rather than docs/a's own end-of-line labels, which needed a
// wide, mostly-empty right margin to avoid clipping category names + amounts.
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
      animationDuration: 1000,
      // bottom: 72 - clearance for a two-row legend (up to 7 categories) plus extra breathing
      // room between the x-axis date labels and the legend below them.
      grid: { left: 4, right: 16, top: 24, bottom: 72, containLabel: true },
      tooltip: {
        trigger: "axis" as const,
        order: "valueDesc" as const,
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
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2, color: SERIES_COLORS[i % SERIES_COLORS.length] },
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
        <div className="flex h-[280px] items-center justify-center text-xs text-muted-foreground">
          No spend history yet
        </div>
      ) : (
        <ReactECharts option={option} style={{ height: 280 }} notMerge />
      )}
    </ChartCard>
  );
}
