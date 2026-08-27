"use client";

import ReactECharts from "echarts-for-react";
import { useMemo } from "react";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Granularity, TrendPoint } from "@/lib/api";
import { useChartColors, withAlpha } from "@/lib/chart-theme";
import { formatCurrency } from "@/lib/format";

import { ChartCard } from "./chart-card";

type SpendingTrendChartProps = {
  data: TrendPoint[];
  granularity: Granularity;
  onGranularityChange: (granularity: Granularity) => void;
  points: number;
  onPointsChange: (points: number) => void;
  loading?: boolean;
  className?: string;
};

const GRANULARITY_OPTIONS: {
  value: Granularity;
  label: string;
  noun: string;
}[] = [
  { value: "day", label: "D", noun: "days" },
  { value: "week", label: "W", noun: "weeks" },
  { value: "month", label: "M", noun: "months" },
  { value: "year", label: "Y", noun: "years" },
];

const POINTS_OPTIONS = [3, 6, 12, 24];

function formatPeriodLabel(period: string, granularity: Granularity): string {
  const date = new Date(period);
  if (granularity === "year") {
    return new Intl.DateTimeFormat("en-US", { year: "numeric" }).format(date);
  }
  if (granularity === "day" || granularity === "week") {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
    }).format(date);
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "2-digit",
  }).format(date);
}

export function SpendingTrendChart({
  data,
  granularity,
  onGranularityChange,
  points,
  onPointsChange,
  loading,
  className,
}: SpendingTrendChartProps) {
  const colors = useChartColors();
  const noun =
    GRANULARITY_OPTIONS.find((option) => option.value === granularity)?.noun ??
    "months";

  // Memoized: `option` must keep a stable reference across renders that don't actually
  // change the data/granularity/colors (e.g. a hover-triggered re-render elsewhere on the
  // page) - with `notMerge`, a fresh object every render forces ECharts to fully re-init and
  // replay its entry animation, which reads as the line disappearing then redrawing on
  // interaction.
  //
  // Crosshair tooltip (axisPointer type "cross" + styled label) and the always-on amount
  // label per point follow docs/vendor's ECharts line-chart template - restyled with this
  // app's own theme colors (colors.primary/card) rather than the template's grey/black.
  const option = useMemo(
    () => ({
      grid: { left: 4, right: 16, top: 36, bottom: 4, containLabel: true },
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
      xAxis: {
        type: "category" as const,
        data: data.map((p) => formatPeriodLabel(p.period, granularity)),
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
      series: [
        {
          type: "line" as const,
          data: data.map((p) => Number(p.total)),
          smooth: true,
          symbol: "circle",
          symbolSize: 7,
          lineStyle: { color: colors.primary, width: 2 },
          itemStyle: {
            color: colors.primary,
            borderColor: colors.card,
            borderWidth: 2,
          },
          // Gradient area fill (top-to-bottom, saturated to transparent) - the canonical
          // ECharts line-chart look (echarts.apache.org/examples, "Line" category) rather
          // than a flat translucent fill.
          areaStyle: {
            color: {
              type: "linear",
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: withAlpha(colors.primary, 0.35) },
                { offset: 1, color: withAlpha(colors.primary, 0) },
              ],
            },
          },
          emphasis: {
            scale: 1.4,
            itemStyle: { borderWidth: 3 },
          },
          label: {
            show: true,
            position: "top" as const,
            formatter: (p: { value: number }) => formatCurrency(p.value),
            fontSize: 10,
            color: colors.mutedForeground,
          },
          markPoint: {
            symbol: "pin",
            symbolSize: 38,
            itemStyle: { color: colors.primary },
            label: {
              formatter: (p: { value: number }) => formatCurrency(p.value),
              fontSize: 9,
              fontWeight: "bold" as const,
              color: colors.card,
            },
            data: [{ type: "max" as const, name: "Peak" }],
          },
        },
      ],
    }),
    [data, granularity, colors],
  );

  return (
    <ChartCard
      title="Spending trend"
      subtitle={`Last ${points} ${noun}`}
      className={className}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Tabs
            value={granularity}
            onValueChange={(value) => onGranularityChange(value as Granularity)}
          >
            <TabsList>
              {GRANULARITY_OPTIONS.map((option) => (
                <TabsTrigger key={option.value} value={option.value}>
                  {option.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <select
            value={points}
            onChange={(e) => onPointsChange(Number(e.target.value))}
            className="h-8 rounded-lg border border-border bg-background px-2 text-xs text-foreground"
            aria-label="Number of points"
          >
            {POINTS_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n} pts
              </option>
            ))}
          </select>
        </div>
      }
    >
      {data.length === 0 ? (
        <div className="flex h-[220px] items-center justify-center text-xs text-muted-foreground">
          No spending recorded yet
        </div>
      ) : (
        <ReactECharts
          option={option}
          style={{ height: 220, opacity: loading ? 0.5 : 1 }}
          notMerge
        />
      )}
    </ChartCard>
  );
}
