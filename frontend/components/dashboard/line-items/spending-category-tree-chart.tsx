"use client";

import ReactECharts from "echarts-for-react";
import { useMemo } from "react";

import { ChartCard } from "@/components/dashboard/overview/chart-card";
import { Button } from "@/components/ui/button";
import type { CategoryTreeNode } from "@/lib/api";
import { useChartColors } from "@/lib/chart-theme";
import { formatCurrency } from "@/lib/format";

type SpendingCategoryTreeChartProps = {
  data: CategoryTreeNode | null;
  onGenerate: () => void;
  onSelectSubcategory: (id: string, name: string) => void;
  generating: boolean;
  className?: string;
};

type EChartsTreeNode = {
  id: string | null;
  name: string;
  value: number;
  pctOfParent: number;
  // Root (depth 0) and top-level category (depth 1) nodes are inert - only subcategory/
  // sub-subcategory nodes (depth >= 2) are clickable, and even then only when `id` is set
  // (the synthetic "Non classé" leaf has none).
  kind: "category" | "subcategory";
  cursor: "pointer" | "default";
  itemStyle: { color: string };
  children: EChartsTreeNode[];
};

// frontend/CLAUDE.md's Line Items page - the sub-categorizer agent's result (category ->
// sub-category -> agent-decided sub-sub-category), visualized per the docs/vendor "flare"
// template: `type: "tree"`, no `layout` set (defaults to orthogonal, left-to-right - NOT
// radial), `edgeShape: "polyline"` + `edgeForkPosition: "63%"`, non-leaf labels on the left of
// their node vs. leaf labels on the right, `expandAndCollapse`. The first tree chart in this
// app - styled to match this page's other charts (ChartCard, useChartColors, empty-state
// placeholder, notMerge) for theming, but the tree's own layout options mirror the template
// exactly rather than reinventing a radial variant.
function toEChartsNode(
  node: CategoryTreeNode,
  color: string,
  depth: number,
): EChartsTreeNode {
  const kind: "category" | "subcategory" =
    depth >= 2 ? "subcategory" : "category";
  return {
    id: node.id,
    name: node.name,
    value: Number(node.total),
    pctOfParent: Number(node.pct_of_parent),
    kind,
    cursor: kind === "subcategory" && node.id ? "pointer" : "default",
    itemStyle: { color },
    children: node.children.map((child) =>
      toEChartsNode(child, color, depth + 1),
    ),
  };
}

export function SpendingCategoryTreeChart({
  data,
  onGenerate,
  onSelectSubcategory,
  generating,
  className,
}: SpendingCategoryTreeChartProps) {
  const colors = useChartColors();

  const option = useMemo(() => {
    if (!data) return {};
    return {
      tooltip: {
        trigger: "item" as const,
        triggerOn: "mousemove" as const,
        formatter: (p: { name: string; data: EChartsTreeNode }) =>
          `${p.name}<br/>${formatCurrency(p.data.value)} — ${p.data.pctOfParent.toFixed(2)}% of parent${p.data.kind === "subcategory" && p.data.id ? "<br/>Click to see line items" : ""}`,
      },
      series: [
        {
          type: "tree" as const,
          data: [toEChartsNode(data, colors.primary, 0)],
          top: "10%",
          left: "8%",
          bottom: "22%",
          right: "20%",
          symbolSize: 7,
          edgeShape: "polyline" as const,
          edgeForkPosition: "63%",
          initialTreeDepth: 3,
          lineStyle: {
            color: colors.border,
            width: 2,
          },
          itemStyle: {
            borderColor: colors.card,
            borderWidth: 2,
          },
          label: {
            backgroundColor: colors.card,
            color: colors.foreground,
            fontSize: 10,
            position: "left" as const,
            verticalAlign: "middle" as const,
            align: "right" as const,
            formatter: (p: { name: string; data: EChartsTreeNode }) =>
              `${p.name}  ${p.data.pctOfParent.toFixed(2)}%`,
          },
          leaves: {
            label: {
              position: "right" as const,
              verticalAlign: "middle" as const,
              align: "left" as const,
            },
          },
          emphasis: { focus: "descendant" as const },
          expandAndCollapse: true,
          animationDuration: 550,
          animationDurationUpdate: 750,
        },
      ],
    };
  }, [data, colors]);

  const isEmpty = !data || data.children.length === 0;

  return (
    <ChartCard
      title="Category breakdown"
      subtitle="Category → sub-category, agent-generated"
      className={className}
      actions={
        <Button
          size="xs"
          variant="outline"
          onClick={onGenerate}
          disabled={generating}
        >
          {generating ? "Generating…" : "Generate sub-categories"}
        </Button>
      }
    >
      {isEmpty ? (
        <div className="flex h-[420px] flex-col items-center justify-center gap-2 text-center text-xs text-muted-foreground">
          <p>No sub-categories yet.</p>
          <p>
            Click &quot;Generate sub-categories&quot; to have the agent break
            your categories down.
          </p>
        </div>
      ) : (
        <ReactECharts
          option={option}
          style={{ height: 420 }}
          notMerge
          showLoading={generating}
          onEvents={{
            click: (params: { data: EChartsTreeNode }) => {
              const node = params.data;
              if (node.kind === "subcategory" && node.id) {
                onSelectSubcategory(node.id, node.name);
              }
            },
          }}
        />
      )}
    </ChartCard>
  );
}
