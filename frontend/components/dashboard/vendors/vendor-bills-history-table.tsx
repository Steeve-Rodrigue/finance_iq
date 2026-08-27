import { ChartCard } from "@/components/dashboard/overview/chart-card";
import { ConfidenceBadge } from "@/components/dashboard/confidence-badge";
import type { VendorBillHistoryRow } from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

type VendorBillsHistoryTableProps = {
  bills: VendorBillHistoryRow[];
  className?: string;
};

// backend/app/models/bills.py's BillStatus - the agent pipeline status, not payment status.
// "resolved" reads as done/settled; "flagged" needs attention; everything else is still
// moving through the pipeline and gets a neutral in-progress treatment.
const STATUS_STYLES: Record<string, string> = {
  resolved: "bg-emerald-500/10 text-emerald-600",
  flagged: "bg-red-500/10 text-red-600",
  archived: "bg-muted text-muted-foreground",
};

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium capitalize",
        STATUS_STYLES[status] ?? "bg-amber-500/10 text-amber-600",
      )}
    >
      {status.replace("_", " ")}
    </span>
  );
}

// Vendor detail's "bills history" table from frontend/CLAUDE.md: name, amount, date, status,
// confidence. Click-through to Bill Detail is deferred - that page doesn't exist yet (same
// reasoning as Overview's RecentUploads).
export function VendorBillsHistoryTable({
  bills,
  className,
}: VendorBillsHistoryTableProps) {
  return (
    <ChartCard
      title="Bills history"
      subtitle="Every bill from this vendor"
      className={className}
    >
      {bills.length === 0 ? (
        <div className="flex h-[120px] items-center justify-center text-xs text-muted-foreground">
          No bills yet
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-[11px] text-muted-foreground">
                <th className="pb-2 font-medium">Bill</th>
                <th className="pb-2 font-medium">Amount</th>
                <th className="pb-2 font-medium">Issue date</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {bills.map((bill) => (
                <tr
                  key={bill.bill_id}
                  className="border-t border-border/60 text-foreground"
                >
                  <td className="max-w-[200px] truncate py-2 font-medium">
                    {bill.name}
                  </td>
                  <td className="py-2">
                    {bill.total_amount
                      ? formatCurrency(bill.total_amount, { precise: true })
                      : "—"}
                  </td>
                  <td className="py-2 text-muted-foreground">
                    {bill.issue_date
                      ? new Intl.DateTimeFormat("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        }).format(new Date(bill.issue_date))
                      : "—"}
                  </td>
                  <td className="py-2">
                    <StatusPill status={bill.status} />
                  </td>
                  <td className="py-2">
                    <ConfidenceBadge value={bill.confidence} />
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
