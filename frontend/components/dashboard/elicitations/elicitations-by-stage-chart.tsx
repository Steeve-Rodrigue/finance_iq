"use client";

import ReactECharts from "echarts-for-react";
import { useMemo } from "react";

import { ChartCard } from "@/components/dashboard/overview/chart-card";
import type { ElicitationsByStage } from "@/lib/api";
import { useChartColors } from "@/lib/chart-theme";

// Fixed order (matches backend/app/models/elicitations.py's ElicitationStage enum) rather
// than whatever order the API happens to return - parsing precedes categorizing precedes
// auditing in the actual pipeline, so the chart should read left to right the same way.
const STAGE_ORDER = ["parsing", "categorizing", "auditing"];

type ElicitationsByStageChartProps = {
  data: ElicitationsByStage[];
  className?: string;
};

// frontend/CLAUDE.md's Elicitations "elicitations by stage" chart: bar chart
// (parsing/categorizing/auditing). Vertical columns here rather than the horizontal bars used
// everywhere else in this app - with only 3 short labels, a plain column chart (the most
// basic ECharts "Bar" example) reads more naturally than a ranked horizontal list.
export function ElicitationsByStageChart({
  data,
  className,
}: ElicitationsByStageChartProps) {
  const colors = useChartColors();

  const option = useMemo(() => {
    const byStage = new Map(data.map((s) => [s.stage, s.count]));
    const ordered = STAGE_ORDER.map((stage) => ({
      stage,
      count: byStage.get(stage) ?? 0,
    }));

    return {
      grid: { left: 4, right: 4, top: 24, bottom: 4, containLabel: true },
      tooltip: {
        trigger: "axis" as const,
        axisPointer: { type: "shadow" as const },
        valueFormatter: (value: number) =>
          `${value} elicitation${value === 1 ? "" : "s"}`,
      },
      xAxis: {
        type: "category" as const,
        data: ordered.map(
          (s) => s.stage.charAt(0).toUpperCase() + s.stage.slice(1),
        ),
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
          type: "bar" as const,
          data: ordered.map((s) => s.count),
          barMaxWidth: 48,
          // Full-track background bar (echarts.apache.org/examples, "Bar" category's
          // background-bar treatment), same as every other bar chart in this app.
          showBackground: true,
          backgroundStyle: { color: colors.border, borderRadius: [4, 4, 0, 0] },
          itemStyle: { color: colors.primary, borderRadius: [4, 4, 0, 0] },
          label: {
            show: true,
            position: "top" as const,
            fontSize: 11,
            color: colors.mutedForeground,
          },
        },
      ],
    };
  }, [data, colors]);

  return (
    <ChartCard
      title="Elicitations by stage"
      subtitle="Which agent stage is asking"
      className={className}
    >
      <ReactECharts option={option} style={{ height: 220 }} notMerge />
    </ChartCard>
  );
}
