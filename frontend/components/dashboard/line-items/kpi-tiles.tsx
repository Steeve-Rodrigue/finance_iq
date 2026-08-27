import { AlertTriangle, Package, ShoppingBasket } from "lucide-react";

import { KpiChip, KpiTile, TINTS } from "@/components/dashboard/kpi-tile";
import type { LineItemsKPIs } from "@/lib/api";
import { formatPercent } from "@/lib/format";

type LineItemsKpiTilesProps = {
  kpis: LineItemsKPIs;
};

// frontend/CLAUDE.md's Line Items "KPI tiles (3)": total line items, most purchased item
// (common_name + count), categorization gap (% without category_id). 3 tiles, not 4 - the
// last one spans the full row on tablet (md:col-span-2 xl:col-span-1) rather than leaving an
// empty cell, same fix as Vendors/Categories' 3-tile rows. Mobile is single-column already, so
// col-span only matters once md:grid-cols-2 is active.
export function LineItemsKpiTiles({ kpis }: LineItemsKpiTilesProps) {
  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3 xl:gap-4">
      <KpiTile
        title="Total line items"
        subtitle="Across all bills"
        icon={Package}
        tint={TINTS.blue}
        value={String(kpis.total_line_items)}
        className="motion-safe:delay-100"
      >
        <KpiChip icon={Package} tint={TINTS.blue.chip}>
          every line, every bill
        </KpiChip>
      </KpiTile>

      <KpiTile
        title="Most purchased"
        subtitle="Highest purchase count"
        icon={ShoppingBasket}
        tint={TINTS.amber}
        value={kpis.most_purchased_item_name ?? "—"}
        className="motion-safe:delay-150"
      >
        {kpis.most_purchased_item_count !== null && (
          <KpiChip icon={ShoppingBasket} tint={TINTS.amber.chip}>
            {kpis.most_purchased_item_count}x bought
          </KpiChip>
        )}
      </KpiTile>

      <KpiTile
        title="Categorization gap"
        subtitle="% line items without a category"
        icon={AlertTriangle}
        tint={TINTS.violet}
        value={formatPercent(kpis.categorization_gap_pct)}
        className="motion-safe:delay-200 md:col-span-2 xl:col-span-1"
      >
        <KpiChip icon={AlertTriangle} tint={TINTS.violet.chip}>
          needs categorizing
        </KpiChip>
      </KpiTile>
    </div>
  );
}
