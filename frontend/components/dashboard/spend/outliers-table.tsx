import { ChartCard } from "@/components/dashboard/overview/chart-card";
import type { Outlier } from "@/lib/api";
import { formatCurrency } from "@/lib/format";

type OutliersTableProps = {
  outliers: Outlier[];
  className?: string;
};

// frontend/CLAUDE.md's Spend Analytics "outliers" detection: top 5 bills with the largest
// deviation vs. that vendor's own average (e.g. "EDF €450 vs avg €150 -> 3x"). Backend already
// scores and caps this at 5 (backend/app/services/analytics/spend_service.py's
// _build_outliers, sorted by |deviation_ratio - 1| descending), so no client-side re-sorting
// needed - deviation_ratio is total_amount / vendor_average directly from the API.
export function OutliersTable({ outliers, className }: OutliersTableProps) {
  return (
    <ChartCard
      title="Outliers"
      subtitle="Biggest deviation vs. that vendor's average"
      className={className}
    >
      {outliers.length === 0 ? (
        <div className="flex h-[120px] items-center justify-center text-xs text-muted-foreground">
          No outliers detected yet
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-[11px] text-muted-foreground">
                <th className="pb-2 font-medium">Bill</th>
                <th className="pb-2 font-medium">Vendor</th>
                <th className="pb-2 font-medium">Amount</th>
                <th className="pb-2 font-medium">Vendor avg</th>
                <th className="pb-2 font-medium">Deviation</th>
              </tr>
            </thead>
            <tbody>
              {outliers.map((o) => {
                const ratio = Number(o.deviation_ratio);
                const above = ratio >= 1;
                return (
                  <tr
                    key={o.bill_id}
                    className="border-t border-border/60 text-foreground"
                  >
                    <td className="max-w-[160px] truncate py-2 font-medium">
                      {o.bill_name}
                    </td>
                    <td className="max-w-[120px] truncate py-2 text-muted-foreground">
                      {o.vendor_name}
                    </td>
                    <td className="py-2">
                      {formatCurrency(o.total_amount, { precise: true })}
                    </td>
                    <td className="py-2 text-muted-foreground">
                      {formatCurrency(o.vendor_average, { precise: true })}
                    </td>
                    <td className="py-2">
                      <span
                        className={
                          above
                            ? "font-medium text-red-600"
                            : "font-medium text-emerald-600"
                        }
                      >
                        {ratio.toFixed(1)}x
                      </span>
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
