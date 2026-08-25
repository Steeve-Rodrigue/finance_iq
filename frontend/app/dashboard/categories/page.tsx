import { PieChart } from "lucide-react";

import { ComingSoon } from "@/components/dashboard/coming-soon";
import { PageHeader } from "@/components/dashboard/page-header";

export default function CategoriesPage() {
  return (
    <div className="flex flex-col gap-6 pt-4">
      <PageHeader icon={PieChart} title="Categories" />
      <ComingSoon
        title="Categories"
        description="Spend and bill count by category, uncategorized/'Other' rate, and the editable category table."
      />
    </div>
  );
}
