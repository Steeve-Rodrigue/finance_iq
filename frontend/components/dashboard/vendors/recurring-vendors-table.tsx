import { ChartCard } from "@/components/dashboard/overview/chart-card";
import type { RecurringVendor } from "@/lib/api";
import { formatCurrency } from "@/lib/format";

type RecurringVendorsTableProps = {
  vendors: RecurringVendor[];
  className?: string;
};

// frontend/CLAUDE.md's Vendors "recurring vendors" table: vendors appearing every month with
// a similar amount (±10%) - subscription candidates. Columns: name, avg amount, frequency,
// last bill (docs/vendor's `recurring_vendors`).
export function RecurringVendorsTable({
  vendors,
  className,
}: RecurringVendorsTableProps) {
  return (
    <ChartCard
      title="Recurring vendors"
      subtitle="Similar amount, roughly every month"
      className={className}
    >
      {vendors.length === 0 ? (
        <div className="flex h-[120px] items-center justify-center text-xs text-muted-foreground">
          No recurring vendors detected yet
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
              {vendors.map((v) => (
                <tr
                  key={v.vendor_name}
                  className="border-t border-border/60 text-foreground"
                >
                  <td className="max-w-[160px] truncate py-2 font-medium">
                    {v.vendor_name}
                  </td>
                  <td className="py-2">
                    {formatCurrency(v.avg_amount, { precise: true })}
                  </td>
                  <td className="py-2">{v.frequency}x</td>
                  <td className="py-2 text-muted-foreground">
                    {new Intl.DateTimeFormat("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    }).format(new Date(v.last_bill_date))}
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
