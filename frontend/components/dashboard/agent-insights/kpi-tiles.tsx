import { Archive, CheckCircle2, ScanLine, Sparkles } from "lucide-react";

import { KpiChip, KpiTile, TINTS } from "@/components/dashboard/kpi-tile";
import type { AgentInsightsKPIs } from "@/lib/api";
import { formatPercent } from "@/lib/format";

type AgentInsightsKpiTilesProps = {
  kpis: AgentInsightsKPIs;
};

// avg_confidence/kpis fields other than the two *_rate ones are the raw 0-1 scale (see
// lib/api.ts's AgentInsightsKPIs comment) - x100 before formatPercent, which expects 0-100.
function formatConfidence(value: string | null): string {
  return value === null ? "—" : formatPercent(Number(value) * 100);
}

// The 4 KPI tiles from frontend/CLAUDE.md's Agent Insights section, backed by
// GET /analytics/agent-insights' `kpis` field.
export function AgentInsightsKpiTiles({ kpis }: AgentInsightsKpiTilesProps) {
  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4 xl:gap-4">
      <KpiTile
        title="Avg confidence"
        subtitle="Across all bills"
        icon={Sparkles}
        tint={TINTS.amber}
        value={formatConfidence(kpis.avg_confidence)}
        className="motion-safe:delay-100"
      >
        <KpiChip icon={Sparkles} tint={TINTS.amber.chip}>
          parser confidence
        </KpiChip>
      </KpiTile>

      <KpiTile
        title="Auto-resolved rate"
        subtitle="No manual review needed"
        icon={CheckCircle2}
        tint={TINTS.green}
        value={formatPercent(kpis.auto_resolved_rate)}
        className="motion-safe:delay-150"
      >
        <KpiChip icon={CheckCircle2} tint={TINTS.green.chip}>
          bills without elicitation
        </KpiChip>
      </KpiTile>

      <KpiTile
        title="In backlog"
        subtitle="Still moving through the pipeline"
        icon={Archive}
        tint={TINTS.violet}
        value={String(kpis.bills_in_backlog)}
        className="motion-safe:delay-300"
      >
        <KpiChip icon={Archive} tint={TINTS.violet.chip}>
          not yet complete
        </KpiChip>
      </KpiTile>
    </div>
  );
}
