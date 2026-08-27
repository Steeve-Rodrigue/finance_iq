import { AlertTriangle, Crown, Tags } from "lucide-react";

import { KpiChip, KpiTile, TINTS } from "@/components/dashboard/kpi-tile";
import type { CategoriesKPIs } from "@/lib/api";
import { formatCurrency } from "@/lib/format";

type CategoriesKpiTilesProps = {
  kpis: CategoriesKPIs;
};

// 3 of the 4 KPI tiles from frontend/CLAUDE.md's Categories section, backed by
// GET /analytics/categories' `kpis` field (docs/vendor). "Other" rate tile removed from
// display per user request (alongside removing its "Other rate over time" chart) -
// kpis.other_rate is still returned by the API, just not rendered here.
export function CategoriesKpiTiles({ kpis }: CategoriesKpiTilesProps) {
  return (
    <div className="grid grid-cols-2 gap-2 xl:grid-cols-3 xl:gap-4">
      <KpiTile
        title="Total categories"
        subtitle="Categories in use"
        icon={Tags}
        tint={TINTS.blue}
        value={String(kpis.total_categories)}
        className="motion-safe:delay-100"
      >
        <KpiChip icon={Tags} tint={TINTS.blue.chip}>
          across all bills
        </KpiChip>
      </KpiTile>

      <KpiTile
        title="Most expensive"
        subtitle="Highest total spend"
        icon={Crown}
        tint={TINTS.amber}
        value={kpis.most_expensive_category_name ?? "—"}
        className="motion-safe:delay-150"
      >
        {kpis.most_expensive_category_total !== null && (
          <KpiChip icon={Crown} tint={TINTS.amber.chip}>
            {formatCurrency(kpis.most_expensive_category_total, {
              precise: true,
            })}
          </KpiChip>
        )}
      </KpiTile>

      <KpiTile
        title="Uncategorized"
        subtitle="Bills with no category"
        icon={AlertTriangle}
        tint={TINTS.violet}
        value={String(kpis.uncategorized_bills_count)}
        className="col-span-2 motion-safe:delay-200 xl:col-span-1"
      >
        <KpiChip icon={AlertTriangle} tint={TINTS.violet.chip}>
          needs categorizing
        </KpiChip>
      </KpiTile>
    </div>
  );
}
