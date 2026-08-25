import { LineChart } from "lucide-react";

import { ComingSoon } from "@/components/dashboard/coming-soon";
import { PageHeader } from "@/components/dashboard/page-header";

export default function SpendAnalyticsPage() {
  return (
    <div className="flex flex-col gap-6 pt-4">
      <PageHeader icon={LineChart} title="Spend Analytics" />
      <ComingSoon
        title="Spend Analytics"
        description="Filtrable trends, patterns, breakdowns, and recurring/outlier detections across all bills."
      />
    </div>
  );
}
