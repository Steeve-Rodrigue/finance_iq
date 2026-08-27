"use client";

import { ArrowLeft, Pencil, Store } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { PageHeader } from "@/components/dashboard/page-header";
import { SectionHeader } from "@/components/dashboard/section-header";
import { Button } from "@/components/ui/button";
import { VendorBillsHistoryTable } from "@/components/dashboard/vendors/vendor-bills-history-table";
import { VendorDetailSkeleton } from "@/components/dashboard/vendors/vendor-detail-skeleton";
import { VendorDetailStats } from "@/components/dashboard/vendors/vendor-detail-stats";
import { VendorEditDialog } from "@/components/dashboard/vendors/vendor-edit-dialog";
import { VendorSpendingTrendChart } from "@/components/dashboard/vendors/vendor-spending-trend-chart";
import {
  ApiError,
  getVendorDetail,
  type VendorDetailResponse,
} from "@/lib/api";
import { getToken } from "@/lib/auth";

// frontend/CLAUDE.md's Vendors "vendor detail (drill-down)" page, reached from the vendor
// table's row links. The header's Edit button reuses VendorEditDialog - the same one the
// list page's table already wires up - rather than a second edit form.
export default function VendorDetailPage() {
  const params = useParams<{ vendorId: string }>();
  const [data, setData] = useState<VendorDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => {
    const token = getToken(); // app/dashboard/layout.tsx's auth guard already ensures this
    if (!token) return; // exists by the time this page mounts.
    let cancelled = false;
    // The resets run inside this first .then, not synchronously in the effect body, so
    // they're a reaction to the fetch starting rather than a direct effect-body setState
    // call - matters when vendorId changes and stale data from the previous vendor needs
    // clearing before the new fetch resolves.
    Promise.resolve()
      .then(() => {
        if (cancelled) return;
        setData(null);
        setError(null);
        setNotFound(false);
      })
      .then(() => getVendorDetail(token, params.vendorId))
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setNotFound(true);
          return;
        }
        setError(
          err instanceof ApiError ? err.message : "Failed to load vendor.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [params.vendorId]);

  const backLink = (
    <Link
      href="/dashboard/vendors"
      className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-3.5" />
      Vendors
    </Link>
  );

  if (notFound) {
    return (
      <div className="flex flex-col gap-4 pt-4">
        {backLink}
        <p className="text-sm text-muted-foreground">
          Vendor not found - it may have been deleted, or the link is wrong.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col gap-4 pt-4">
        {backLink}
        <p className="text-sm text-destructive">
          Couldn&apos;t load this vendor: {error}
        </p>
      </div>
    );
  }

  if (!data) return <VendorDetailSkeleton />;

  return (
    <div className="flex flex-col gap-6 pt-4">
      {backLink}
      <PageHeader
        icon={Store}
        title={data.name}
        description={data.address ?? "No address on file for this vendor"}
        actions={
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil />
            Edit
          </Button>
        }
      />
      <SectionHeader title="Overview" className="-mt-2 -mb-3 md:mt-0" />
      <VendorDetailStats vendor={data} />
      <SectionHeader title="Spending trend" className="-mt-2 -mb-3 md:mt-0" />
      <VendorSpendingTrendChart data={data.spending_trend} />
      <SectionHeader title="Bills history" className="-mt-2 -mb-3 md:mt-0" />
      <VendorBillsHistoryTable bills={data.bills_history} />
      <VendorEditDialog
        vendorId={params.vendorId}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={(updated) => {
          // A name/address/key edit doesn't touch total_spent/bill_count/spending_trend/
          // bills_history - merge just the edited fields rather than refetching the whole
          // detail response for nothing.
          setData((prev) =>
            prev
              ? { ...prev, name: updated.name, address: updated.address }
              : prev,
          );
        }}
      />
    </div>
  );
}
