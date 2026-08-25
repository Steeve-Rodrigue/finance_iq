import { Bot } from "lucide-react";

import { ComingSoon } from "@/components/dashboard/coming-soon";
import { PageHeader } from "@/components/dashboard/page-header";

export default function AgentInsightsPage() {
  return (
    <div className="flex flex-col gap-6 pt-4">
      <PageHeader icon={Bot} title="Agent Insights" />
      <ComingSoon
        title="Agent Insights"
        description="Confidence trends, auto-resolved rate, OCR rate, and extraction strategy effectiveness."
      />
    </div>
  );
}
