"use client";

import ReactECharts from "echarts-for-react";
import { useMemo } from "react";

import { ChartCard } from "@/components/dashboard/overview/chart-card";
import type { ConfidenceByCategory } from "@/lib/api";
import { useChartColors } from "@/lib/chart-theme";
import { formatPercent } from "@/lib/format";

type ConfidenceByCategoryChartProps = {
  data: ConfidenceByCategory[];
  className?: string;
};

// frontend/CLAUDE.md's Agent Insights "confidence by category" chart: bar chart, AVG
// confidence per category. The API already orders ascending by confidence - worst first, an
// intentional "needs attention" ordering (backend/app/repos/analytics/agent_insights_repo.py's
// get_confidence_by_category) - reversed here so the worst-performing category renders at the
// TOP of the horizontal bar (ECharts' category y-axis draws index 0 at the bottom). Categories
// with no confidence data yet (bills still mid-pipeline) are dropped rather than shown as a
// misleading 0%.
export function ConfidenceByCategoryChart({
  data,
  className,
}: ConfidenceByCategoryChartProps) {
  const colors = useChartColors();
  // Own useMemo (not a plain filter) so its reference stays stable across renders where
  // `data` hasn't changed - it's a dependency of the `option` memo below, and a fresh array
  // reference every render would defeat that memoization the same way a fresh `option` object
  // would (see ChartCard's `notMerge` reasoning elsewhere in this app).
  const withConfidence = useMemo(
    () => data.filter((c) => c.avg_confidence !== null),
    [data],
  );

  const option = useMemo(() => {
    const reversed = [...withConfidence].reverse();

    return {
      grid: { left: 4, right: 32, top: 8, bottom: 4, containLabel: true },
      tooltip: {
        trigger: "axis" as const,
        axisPointer: { type: "shadow" as const },
        valueFormatter: (value: number) => formatPercent(value, 1),
      },
      xAxis: {
        type: "value" as const,
        min: 0,
        max: 100,
        splitLine: {
          lineStyle: { color: colors.border, type: "dashed" as const },
        },
        axisLabel: {
          color: colors.mutedForeground,
          fontSize: 11,
          formatter: (value: number) => formatPercent(value),
        },
      },
      yAxis: {
        type: "category" as const,
        data: reversed.map((c) => c.category_name),
        axisLine: { lineStyle: { color: colors.border } },
        axisTick: { show: false },
        axisLabel: { color: colors.mutedForeground, fontSize: 11 },
      },
      series: [
        {
          type: "bar" as const,
          data: reversed.map((c) => Number(c.avg_confidence) * 100),
          barMaxWidth: 18,
          // Full-track background bar (echarts.apache.org/examples, "Bar" category's
          // background-bar treatment) instead of a bare bar floating on empty space. Doubles
          // as a visual 0-100% ruler here since the x-axis is a fixed confidence scale.
          showBackground: true,
          backgroundStyle: { color: colors.border, borderRadius: [0, 4, 4, 0] },
          itemStyle: { color: colors.primary, borderRadius: [0, 4, 4, 0] },
          label: {
            show: true,
            position: "right" as const,
            formatter: (p: { value: number }) => formatPercent(p.value, 1),
            fontSize: 10,
            color: colors.mutedForeground,
          },
        },
      ],
    };
  }, [withConfidence, colors]);

  return (
    <ChartCard
      title="Confidence by category"
      subtitle="Lowest confidence first"
      className={className}
    >
      {withConfidence.length === 0 ? (
        <div className="flex h-[240px] items-center justify-center text-xs text-muted-foreground">
          No bills processed yet
        </div>
      ) : (
        <ReactECharts
          option={option}
          style={{
            height: Math.max(160, Math.min(withConfidence.length, 10) * 32),
          }}
          notMerge
        />
      )}
    </ChartCard>
  );
}
