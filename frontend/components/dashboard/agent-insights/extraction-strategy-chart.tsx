"use client";

import ReactECharts from "echarts-for-react";
import { useMemo } from "react";

import { ChartCard } from "@/components/dashboard/overview/chart-card";
import type { ExtractionStrategyConfidence } from "@/lib/api";
import { useChartColors } from "@/lib/chart-theme";
import { formatPercent } from "@/lib/format";

type ExtractionStrategyChartProps = {
  data: ExtractionStrategyConfidence[];
  className?: string;
};

// frontend/CLAUDE.md's Agent Insights "extraction strategy effectiveness" chart: AVG
// confidence per strategy (e.g. "structured" vs "ocr"). Unlike confidence-by-category, the API
// doesn't order this list (backend/app/repos/analytics/agent_insights_repo.py's
// get_extraction_strategy_effectiveness has no ORDER BY), so it's sorted ascending here -
// same "worst first" framing as that chart, then reversed for the same reason (ECharts'
// category y-axis draws index 0 at the bottom). Strategies with no confidence data yet are
// dropped rather than shown as a misleading 0%.
export function ExtractionStrategyChart({
  data,
  className,
}: ExtractionStrategyChartProps) {
  const colors = useChartColors();
  const withConfidence = useMemo(
    () => data.filter((s) => s.avg_confidence !== null),
    [data],
  );

  const option = useMemo(() => {
    const sorted = [...withConfidence]
      .sort((a, b) => Number(a.avg_confidence) - Number(b.avg_confidence))
      .reverse();

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
        data: sorted.map((s) => s.extraction_strategy),
        axisLine: { lineStyle: { color: colors.border } },
        axisTick: { show: false },
        axisLabel: {
          color: colors.mutedForeground,
          fontSize: 11,
          formatter: (value: string) =>
            value.charAt(0).toUpperCase() + value.slice(1),
        },
      },
      series: [
        {
          type: "bar" as const,
          data: sorted.map((s) => Number(s.avg_confidence) * 100),
          barMaxWidth: 18,
          // Full-track background bar (echarts.apache.org/examples, "Bar" category's
          // background-bar treatment) instead of a bare bar floating on empty space. Doubles
          // as a visual 0-100% ruler here since the x-axis is a fixed confidence scale.
          showBackground: true,
          backgroundStyle: { color: colors.border, borderRadius: [0, 4, 4, 0] },
          itemStyle: { color: "#7c5cbf", borderRadius: [0, 4, 4, 0] },
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
      title="Extraction strategy effectiveness"
      subtitle="Average confidence per strategy"
      className={className}
    >
      {withConfidence.length === 0 ? (
        <div className="flex h-[160px] items-center justify-center text-xs text-muted-foreground">
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
