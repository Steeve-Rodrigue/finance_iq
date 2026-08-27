import {
  Calendar,
  CheckCircle2,
  FileCheck2,
  MessageCircleQuestion,
  Minus,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";

import { KpiChip, KpiTile, TINTS } from "@/components/dashboard/kpi-tile";
import type { OverviewKPIs } from "@/lib/api";
import { formatCurrency, formatMonthLabel, formatPercent } from "@/lib/format";

type KpiTilesProps = {
  kpis: OverviewKPIs;
};

// The 4 KPI tiles from frontend/CLAUDE.md's Overview section, backed by
// GET /analytics/overview's `kpis` field. Distinct hues per tile (amber/blue/violet/green,
// the same family Vendors' kpi-tiles.tsx uses) rather than the all-amber-shades palette this
// row started with, so the four numbers read as separate metrics at a glance.
export function KpiTiles({ kpis }: KpiTilesProps) {
  const deltaPct =
    kpis.spend_delta_pct === null ? null : Number(kpis.spend_delta_pct);
  const DeltaIcon =
    deltaPct === null || deltaPct === 0
      ? Minus
      : deltaPct > 0
        ? TrendingUp
        : TrendingDown;

  return (
    <div className="grid grid-cols-2 gap-2 xl:grid-cols-4 xl:gap-4">
      <KpiTile
        title="Total spent"
        subtitle="Your overall expenses"
        icon={Wallet}
        tint={TINTS.amber}
        value={formatCurrency(kpis.total_spent_current_month)}
        className="motion-safe:delay-100"
      >
        <KpiChip icon={Calendar} tint={TINTS.amber.chip}>
          {formatMonthLabel(0, { includeYear: true })}
        </KpiChip>
        <KpiChip icon={DeltaIcon} tint={TINTS.amber.chip}>
          {formatMonthLabel(-1)} —{" "}
          {formatCurrency(kpis.total_spent_previous_month)}
          {deltaPct !== null &&
            ` · ${deltaPct >= 0 ? "↑" : "↓"}${Math.abs(deltaPct).toFixed(1)}%`}
        </KpiChip>
      </KpiTile>

      <KpiTile
        title="Bills processed"
        subtitle="Uploaded this month"
        icon={FileCheck2}
        tint={TINTS.blue}
        value={String(kpis.bills_processed_current_month)}
        className="motion-safe:delay-150"
      >
        <KpiChip icon={Calendar} tint={TINTS.blue.chip}>
          {formatMonthLabel(0, { includeYear: true })}
        </KpiChip>
      </KpiTile>

      <KpiTile
        title="Pending elicitations"
        subtitle="Needs your input"
        icon={MessageCircleQuestion}
        tint={TINTS.violet}
        value={String(kpis.pending_elicitations)}
        className="motion-safe:delay-200"
      >
        <KpiChip icon={MessageCircleQuestion} tint={TINTS.violet.chip}>
          awaiting your answer
        </KpiChip>
      </KpiTile>

      <KpiTile
        title="Auto-resolved rate"
        subtitle="No manual review needed"
        icon={CheckCircle2}
        tint={TINTS.green}
        value={formatPercent(kpis.auto_resolved_rate)}
        className="motion-safe:delay-300"
      >
        <KpiChip icon={CheckCircle2} tint={TINTS.green.chip}>
          bills without elicitation
        </KpiChip>
      </KpiTile>
    </div>
  );
}
