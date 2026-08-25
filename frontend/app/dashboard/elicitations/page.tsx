import { CircleHelp } from "lucide-react";

import { ComingSoon } from "@/components/dashboard/coming-soon";
import { PageHeader } from "@/components/dashboard/page-header";

export default function ElicitationsPage() {
  return (
    <div className="flex flex-col gap-6 pt-4">
      <PageHeader icon={CircleHelp} title="Elicitations" />
      <ComingSoon
        title="Elicitations"
        description="Pending/answered/expired elicitations, elicitation rate over time, and answering pending questions - absorbs /clarify.html."
      />
    </div>
  );
}
