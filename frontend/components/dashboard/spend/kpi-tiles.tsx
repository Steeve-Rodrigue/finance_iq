import { Crown, FileCheck2, Scale, Wallet } from "lucide-react";

import { KpiChip, KpiTile, TINTS } from "@/components/dashboard/kpi-tile";
import type { SpendKPIs } from "@/lib/api";
import { formatCurrency } from "@/lib/format";

type SpendKpiTilesProps = {
  kpis: SpendKPIs;
};

// frontend/CLAUDE.md's Spend Analytics "KPI tiles (4, reactive to filters)": total spent,
// bills count, average bill amount, highest single bill (amount + vendor).
export function SpendKpiTiles({ kpis }: SpendKpiTilesProps) {
  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4 xl:gap-4">
      <KpiTile
        title="Total spent"
        subtitle="Matching current filters"
        icon={Wallet}
        tint={TINTS.amber}
        value={formatCurrency(kpis.total_spent)}
        className="motion-safe:delay-100"
      >
        <KpiChip icon={Wallet} tint={TINTS.amber.chip}>
          all filtered bills
        </KpiChip>
      </KpiTile>

      <KpiTile
        title="Bills"
        subtitle="Total bill count"
        icon={FileCheck2}
        tint={TINTS.blue}
        value={String(kpis.bills_count)}
        className="motion-safe:delay-150"
      ></KpiTile>

      <KpiTile
        title="Average bill"
        subtitle="Mean amount per bill"
        icon={Scale}
        tint={TINTS.violet}
        value={formatCurrency(kpis.average_bill_amount, { precise: true })}
        className="motion-safe:delay-200"
      ></KpiTile>

      <KpiTile
        title="Highest bill"
        subtitle="Largest single amount"
        icon={Crown}
        tint={TINTS.green}
        value={
          kpis.highest_bill_amount
            ? formatCurrency(kpis.highest_bill_amount, { precise: true })
            : "—"
        }
        className="motion-safe:delay-300"
      >
        {kpis.highest_bill_vendor_name && (
          <KpiChip icon={Crown} tint={TINTS.green.chip}>
            {kpis.highest_bill_vendor_name}
          </KpiChip>
        )}
      </KpiTile>
    </div>
  );
}
