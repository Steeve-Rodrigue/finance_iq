"use client";

import ReactECharts from "echarts-for-react";
import { useMemo } from "react";

import { ChartCard } from "@/components/dashboard/overview/chart-card";
import type { PaymentStatusBreakdown } from "@/lib/api";
import { formatCurrency } from "@/lib/format";

type PaymentStatusChartProps = {
  data: PaymentStatusBreakdown[];
  className?: string;
};

// backend/app/models/bills.py's PaymentStatus - semantic colors, not the mixed palette used
// for category/vendor-name charts: paid reads as done/good, overdue/disputed need attention.
const STATUS_COLORS: Record<string, string> = {
  paid: "#3f9c6d",
  partial: "#f2b705",
  unpaid: "#3f88c5",
  overdue: "#e2574c",
  disputed: "#7c5cbf",
};
// Fixed order (not whatever order the API happens to return), so the bar reads the same way
// every time: settled first, most-needs-attention last.
const STATUS_ORDER = ["paid", "partial", "unpaid", "overdue", "disputed"];

// frontend/CLAUDE.md's Spend Analytics "payment status breakdown" chart: stacked bar. Unlike
// this app's other stacked charts (category evolution etc., stacked over TIME), there's no
// time dimension here (backend/app/repos/analytics/spend_repo.py's
// get_payment_status_breakdown returns one row per status, not per period) - so this is one
// single bar, its whole length split into up to 5 colored segments by proportion, a 100%-
// composition view rather than a trend.
export function PaymentStatusChart({
  data,
  className,
}: PaymentStatusChartProps) {
  // Own useMemo (not a plain Map construction) so its reference stays stable across renders
  // where `data` hasn't changed - it's a dependency of the `option` memo below, and a fresh
  // Map reference every render would defeat that memoization (see agent-insights/
  // confidence-by-category-chart.tsx's identical reasoning for its `withConfidence` memo).
  const byStatus = useMemo(
    () => new Map(data.map((s) => [s.payment_status, s])),
    [data],
  );
  const total = data.reduce((sum, s) => sum + Number(s.total), 0);

  const option = useMemo(
    () => ({
      grid: { left: 4, right: 16, top: 8, bottom: 4, containLabel: true },
      tooltip: {
        trigger: "item" as const,
        formatter: (p: { seriesName: string; value: number }) =>
          `${p.seriesName}: ${formatCurrency(p.value)}`,
      },
      xAxis: {
        type: "value" as const,
        show: false,
      },
      yAxis: {
        type: "category" as const,
        data: ["Payment status"],
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { show: false },
      },
      series: STATUS_ORDER.filter((status) => byStatus.has(status)).map(
        (status) => ({
          name: status.charAt(0).toUpperCase() + status.slice(1),
          type: "bar" as const,
          stack: "total",
          barWidth: 40,
          itemStyle: { color: STATUS_COLORS[status] },
          data: [Number(byStatus.get(status)?.total ?? 0)],
        }),
      ),
    }),
    [byStatus],
  );

  return (
    <ChartCard
      title="Payment status"
      subtitle="Composition by total amount"
      className={className}
    >
      {total === 0 ? (
        <div className="flex h-[120px] items-center justify-center text-xs text-muted-foreground">
          No bills yet
        </div>
      ) : (
        <>
          <ReactECharts option={option} style={{ height: 80 }} notMerge />
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5">
            {STATUS_ORDER.filter((status) => byStatus.has(status)).map(
              (status) => {
                const row = byStatus.get(status);
                if (!row) return null;
                return (
                  <span
                    key={status}
                    className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
                  >
                    <span
                      className="size-2 rounded-full"
                      style={{ backgroundColor: STATUS_COLORS[status] }}
                    />
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                    <span className="font-medium text-foreground">
                      {formatCurrency(row.total, { precise: true })}
                    </span>
                  </span>
                );
              },
            )}
          </div>
        </>
      )}
    </ChartCard>
  );
}
