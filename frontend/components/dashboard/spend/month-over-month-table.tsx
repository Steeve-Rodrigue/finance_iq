import { TrendingDown, TrendingUp } from "lucide-react";

import { ChartCard } from "@/components/dashboard/overview/chart-card";
import type { MonthOverMonthRow } from "@/lib/api";
import { formatCurrency, formatPercent } from "@/lib/format";

type MonthOverMonthTableProps = {
  title: string;
  nameColumnLabel: string;
  rows: MonthOverMonthRow[];
  className?: string;
};

// frontend/CLAUDE.md's Spend Analytics "month over month comparison" detection: one table
// per category/vendor with current month, previous month, delta %. One generic component
// used twice (by category, by vendor in the page) rather than two near-identical files - the
// two backend rows (month_over_month_by_category/by_vendor) already share the exact same
// {name, current_month, previous_month, delta_pct} shape (backend/app/services/analytics/
// spend_service.py's _build_month_over_month is the one function behind both).
export function MonthOverMonthTable({
  title,
  nameColumnLabel,
  rows,
  className,
}: MonthOverMonthTableProps) {
  return (
    <ChartCard
      title={title}
      subtitle="Current month vs. previous"
      className={className}
    >
      {rows.length === 0 ? (
        <div className="flex h-[120px] items-center justify-center text-xs text-muted-foreground">
          No data yet
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-[11px] text-muted-foreground">
                <th className="pb-2 font-medium">{nameColumnLabel}</th>
                <th className="pb-2 font-medium">This month</th>
                <th className="pb-2 font-medium">Last month</th>
                <th className="pb-2 font-medium">Change</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const delta =
                  row.delta_pct === null ? null : Number(row.delta_pct);
                const DeltaIcon =
                  delta === null
                    ? null
                    : delta >= 0
                      ? TrendingUp
                      : TrendingDown;
                return (
                  <tr
                    key={row.name}
                    className="border-t border-border/60 text-foreground"
                  >
                    <td className="max-w-[160px] truncate py-2 font-medium">
                      {row.name}
                    </td>
                    <td className="py-2">
                      {formatCurrency(row.current_month, { precise: true })}
                    </td>
                    <td className="py-2 text-muted-foreground">
                      {formatCurrency(row.previous_month, { precise: true })}
                    </td>
                    <td className="py-2">
                      {delta === null || DeltaIcon === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span
                          className={`inline-flex items-center gap-1 font-medium ${
                            delta >= 0 ? "text-red-600" : "text-emerald-600"
                          }`}
                        >
                          <DeltaIcon className="size-3" />
                          {formatPercent(Math.abs(delta), 1)}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </ChartCard>
  );
}
