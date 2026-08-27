import { ChartCard } from "@/components/dashboard/overview/chart-card";
import type { RecurringBill } from "@/lib/api";
import { formatCurrency } from "@/lib/format";

type RecurringBillsTableProps = {
  bills: RecurringBill[];
  className?: string;
};

// frontend/CLAUDE.md's Spend Analytics "recurring bills" detection: vendors appearing every
// month with similar amounts (±10%) - subscription candidates. Same detection heuristic and
// table shape as vendors/recurring-vendors-table.tsx (both call the same
// build_recurring_bills helper server-side, backend/app/services/analytics/
// spend_service.py) - this page's isn't scoped to just Vendors, and isn't filtered by the
// page's own date-range filter (the lookback window is fixed, independent of it).
export function RecurringBillsTable({
  bills,
  className,
}: RecurringBillsTableProps) {
  return (
    <ChartCard
      title="Recurring bills"
      subtitle="Similar amount, roughly every month"
      className={className}
    >
      {bills.length === 0 ? (
        <div className="flex h-[120px] items-center justify-center text-xs text-muted-foreground">
          No recurring bills detected yet
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-[11px] text-muted-foreground">
                <th className="pb-2 font-medium">Vendor</th>
                <th className="pb-2 font-medium">Avg amount</th>
                <th className="pb-2 font-medium">Frequency</th>
                <th className="pb-2 font-medium">Last bill</th>
              </tr>
            </thead>
            <tbody>
              {bills.map((b) => (
                <tr
                  key={b.vendor_name}
                  className="border-t border-border/60 text-foreground"
                >
                  <td className="max-w-[160px] truncate py-2 font-medium">
                    {b.vendor_name}
                  </td>
                  <td className="py-2">
                    {formatCurrency(b.avg_amount, { precise: true })}
                  </td>
                  <td className="py-2">{b.frequency}x</td>
                  <td className="py-2 text-muted-foreground">
                    {new Intl.DateTimeFormat("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    }).format(new Date(b.last_bill_date))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ChartCard>
  );
}
