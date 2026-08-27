"use client";

import ReactECharts from "echarts-for-react";
import { useMemo } from "react";

import { ChartCard } from "@/components/dashboard/overview/chart-card";
import type { DocumentTypeSpend } from "@/lib/api";
import { useChartColors } from "@/lib/chart-theme";
import { formatCurrency } from "@/lib/format";

type DocumentTypeChartProps = {
  data: DocumentTypeSpend[];
  className?: string;
};

function formatDocType(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).replace("_", " ");
}

// frontend/CLAUDE.md's Spend Analytics "spend by document type" chart: bar chart
// (invoice/receipt/statement/subscription/other) - note: only invoice/receipt are populated
// until the parser prompt is broadened (frontend/CLAUDE.md's Data completeness section), so
// the other 3 types show empty for now, not an error. Backend already returns this sorted
// desc (backend/app/repos/analytics/spend_repo.py's get_spend_by_document_type), reversed
// here for the horizontal bar's top-to-bottom reading order.
export function DocumentTypeChart({ data, className }: DocumentTypeChartProps) {
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
        data: reversed.map((d) => formatDocType(d.document_type)),
        axisLine: { lineStyle: { color: colors.border } },
        axisTick: { show: false },
        axisLabel: { color: colors.mutedForeground, fontSize: 11 },
      },
      series: [
        {
          type: "bar" as const,
          data: reversed.map((d) => Number(d.total)),
          barMaxWidth: 18,
          showBackground: true,
          backgroundStyle: { color: colors.border, borderRadius: [0, 4, 4, 0] },
          itemStyle: { color: "#7c5cbf", borderRadius: [0, 4, 4, 0] },
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
      title="Spend by document type"
      subtitle="Matching current filters"
      className={className}
    >
      {data.length === 0 ? (
        <div className="flex h-[160px] items-center justify-center text-xs text-muted-foreground">
          No bills yet
        </div>
      ) : (
        <ReactECharts
          option={option}
          style={{ height: Math.max(120, Math.min(data.length, 6) * 36) }}
          notMerge
        />
      )}
    </ChartCard>
  );
}
