import { Receipt, Scale, Wallet } from "lucide-react";

import { KpiTile, TINTS } from "@/components/dashboard/kpi-tile";
import type { VendorDetailResponse } from "@/lib/api";
import { formatCurrency } from "@/lib/format";

type VendorDetailStatsProps = {
  vendor: VendorDetailResponse;
};

// frontend/CLAUDE.md's Vendor detail header stats: total spent lifetime, bill count, avg
// bill amount. Name/address/edit button live in the page header instead (PageHeader).
export function VendorDetailStats({ vendor }: VendorDetailStatsProps) {
  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-3 xl:gap-4">
      <KpiTile
        title="Total spent"
        subtitle="Lifetime, this vendor"
        icon={Wallet}
        tint={TINTS.amber}
        value={formatCurrency(vendor.total_spent, { precise: true })}
        className="motion-safe:delay-100"
      >
        {null}
      </KpiTile>
      <KpiTile
        title="Bills"
        subtitle="Total bill count"
        icon={Receipt}
        tint={TINTS.blue}
        value={String(vendor.bill_count)}
        className="motion-safe:delay-150"
      >
        {null}
      </KpiTile>
      <KpiTile
        title="Average bill"
        subtitle="Mean amount per bill"
        icon={Scale}
        tint={TINTS.violet}
        value={formatCurrency(vendor.avg_bill_amount, { precise: true })}
        className="motion-safe:delay-200"
      >
        {null}
      </KpiTile>
    </div>
  );
}
