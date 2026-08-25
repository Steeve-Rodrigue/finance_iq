import { ClipboardList } from "lucide-react";

import { ComingSoon } from "@/components/dashboard/coming-soon";
import { PageHeader } from "@/components/dashboard/page-header";

export default function BillsExplorerPage() {
  return (
    <div className="flex flex-col gap-6 pt-4">
      <PageHeader icon={ClipboardList} title="Bills Explorer" />
      <ComingSoon
        title="Bills Explorer"
        description="Filtrable, sortable, paginated bill table with upload and drill-down into Bill Detail."
      />
    </div>
  );
}
