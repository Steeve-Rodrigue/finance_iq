import {
  CheckCircle2,
  MessageCircleQuestion,
  Sparkles,
  Tags,
} from "lucide-react";

import { KpiChip, KpiTile, TINTS } from "@/components/dashboard/kpi-tile";
import type { ElicitationsKPIs } from "@/lib/api";
import { formatPercent } from "@/lib/format";

type ElicitationsKpiTilesProps = {
  kpis: ElicitationsKPIs;
};

// avg_confidence is the raw 0-1 scale (see lib/api.ts's AgentInsightsKPIs comment) - x100
// before formatPercent, which expects 0-100.
function formatConfidence(value: string | null): string {
  return value === null ? "—" : formatPercent(Number(value) * 100);
}

// frontend/CLAUDE.md's Elicitations "KPI tiles (4)": pending, answered, expired, expiration
// rate. Expired/expiration rate removed from display per user request - kpis.expired_count/
// expiration_rate are still returned by the API, just not rendered here. The orange
// MessageCircleQuestion tint matches Overview's PendingQuestions icon treatment, for the same
// "needs your input" meaning. The remaining 2 tiles are the "Also displayed here (from
// Overview): Avg confidence, Uncategorized bills count" values - one shared grid with the
// first 2 (not a separate row) so all 4 sit on one line on desktop.
export function ElicitationsKpiTiles({ kpis }: ElicitationsKpiTilesProps) {
  return (
    <div className="grid grid-cols-2 gap-2 xl:grid-cols-4 xl:gap-4">
      <KpiTile
        title="Pending"
        subtitle="Waiting on your input"
        icon={MessageCircleQuestion}
        tint={TINTS.orange}
        value={String(kpis.pending_count)}
        className="motion-safe:delay-100"
      >
        <KpiChip icon={MessageCircleQuestion} tint={TINTS.orange.chip}>
          needs an answer
        </KpiChip>
      </KpiTile>

      <KpiTile
        title="Answered"
        subtitle="Resolved by you"
        icon={CheckCircle2}
        tint={TINTS.green}
        value={String(kpis.answered_count)}
        className="motion-safe:delay-150"
      >
        <KpiChip icon={CheckCircle2} tint={TINTS.green.chip}>
          answered
        </KpiChip>
      </KpiTile>

      <KpiTile
        title="Avg confidence"
        subtitle="Across all bills"
        icon={Sparkles}
        tint={TINTS.amberDeep}
        value={formatConfidence(kpis.avg_confidence)}
        className="motion-safe:delay-200"
      >
        <KpiChip icon={Sparkles} tint={TINTS.amberDeep.chip}>
          parser confidence
        </KpiChip>
      </KpiTile>

      <KpiTile
        title="Uncategorized"
        subtitle="Bills with no category"
        icon={Tags}
        tint={TINTS.violet}
        value={String(kpis.uncategorized_bills_count)}
        className="motion-safe:delay-300"
      >
        <KpiChip icon={Tags} tint={TINTS.violet.chip}>
          needs categorizing
        </KpiChip>
      </KpiTile>
    </div>
  );
}
