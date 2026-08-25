import { ReceiptText } from "lucide-react";

import { ComingSoon } from "@/components/dashboard/coming-soon";
import { PageHeader } from "@/components/dashboard/page-header";

export default function LineItemsPage() {
  return (
    <div className="flex flex-col gap-6 pt-4">
      <PageHeader icon={ReceiptText} title="Line Items" />
      <ComingSoon
        title="Line Items"
        description="Most frequent/highest-spend items, unit price trends, and the filterable line item table."
      />
    </div>
  );
}
