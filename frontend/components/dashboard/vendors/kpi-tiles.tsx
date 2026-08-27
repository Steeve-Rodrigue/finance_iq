import { Crown, Store, TrendingUp } from "lucide-react";

import { KpiChip, KpiTile, TINTS } from "@/components/dashboard/kpi-tile";
import type { VendorsKPIs } from "@/lib/api";
import { formatCurrency, formatPercent } from "@/lib/format";

type VendorsKpiTilesProps = {
  kpis: VendorsKPIs;
};

// 3 of the 4 KPI tiles from frontend/CLAUDE.md's Vendors section, backed by
// GET /analytics/vendors' `kpis` field (docs/vendor). "New vendors" tile removed from
// display per user request - kpis.new_vendors_this_month is still returned by the API and
// used by kpi-tiles.tsx's typing, just not rendered here.
export function VendorsKpiTiles({ kpis }: VendorsKpiTilesProps) {
  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3 xl:gap-4">
      <KpiTile
        title="Total vendors"
        subtitle="Distinct vendors billed"
        icon={Store}
        tint={TINTS.blue}
        value={String(kpis.total_vendors)}
        className="motion-safe:delay-100"
      >
        <KpiChip icon={Store} tint={TINTS.blue.chip}>
          across all bills
        </KpiChip>
      </KpiTile>

      <KpiTile
        title="Top vendor"
        subtitle="Where you spend the most"
        icon={Crown}
        tint={TINTS.amber}
        value={kpis.top_vendor_name ?? "—"}
        className="motion-safe:delay-150"
      >
        {kpis.top_vendor_total !== null && (
          <KpiChip icon={Crown} tint={TINTS.amber.chip}>
            {formatCurrency(kpis.top_vendor_total, { precise: true })}
          </KpiChip>
        )}
      </KpiTile>

      <KpiTile
        title="Vendor concentration"
        subtitle="Top 3 as % of total spend"
        icon={TrendingUp}
        tint={TINTS.violet}
        value={formatPercent(kpis.vendor_concentration_pct)}
        className="col-span-2 motion-safe:delay-300 xl:col-span-1"
      >
        <KpiChip icon={TrendingUp} tint={TINTS.violet.chip}>
          top 3 vendors
        </KpiChip>
      </KpiTile>
    </div>
  );
}
