import { Store } from "lucide-react";

import { ComingSoon } from "@/components/dashboard/coming-soon";
import { PageHeader } from "@/components/dashboard/page-header";

export default function VendorsPage() {
  return (
    <div className="flex flex-col gap-6 pt-4">
      <PageHeader icon={Store} title="Vendors" />
      <ComingSoon
        title="Vendors"
        description="Top vendors, concentration, the vendor table, and per-vendor drill-down."
      />
    </div>
  );
}
