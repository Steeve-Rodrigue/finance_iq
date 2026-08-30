"use client";

import { ClipboardList } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { BillFilters } from "@/components/dashboard/bills/bill-filters";
import { BillUploadButton } from "@/components/dashboard/bills/bill-upload-button";
import { BillsSkeleton } from "@/components/dashboard/bills/bills-skeleton";
import { BillsTable } from "@/components/dashboard/bills/bills-table";
import { PageHeader } from "@/components/dashboard/page-header";
import {
  ApiError,
  getBills,
  getCategories,
  getVendors,
  type BillRead,
  type CategoryRead,
  type VendorRead,
} from "@/lib/api";
import { getToken } from "@/lib/auth";
import { useUploadProgress } from "@/lib/upload-progress-context";

// GET /bills/ has no query params at all (see bill-filters.tsx's comment) - this page fetches
// the full bills/vendors/categories lists once (refetched via refreshKey after an
// upload/delete) and does every filter/search/sort/pagination client-side.
export default function BillsExplorerPage() {
  const [bills, setBills] = useState<BillRead[] | null>(null);
  const [vendors, setVendors] = useState<VendorRead[]>([]);
  const [categories, setCategories] = useState<CategoryRead[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  // Also refetches when an upload finishes from the sidebar's global uploader, which has no
  // direct reference to this page's own refreshKey (see upload-progress-context.tsx).
  const { uploadVersion } = useUploadProgress();

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");

  // Vendor/category dropdown options + name lookups - fetched once, independent of the bills
  // refetch below. A failure here just leaves those dropdowns empty and names falling back to
  // "—"/"Uncategorized" rather than blocking the page.
  useEffect(() => {
    const token = getToken(); // app/dashboard/layout.tsx's auth guard already ensures this
    if (!token) return; // exists by the time this page mounts.
    let cancelled = false;
    Promise.all([getVendors(token), getCategories(token)])
      .then(([v, c]) => {
        if (cancelled) return;
        setVendors(v);
        setCategories(c);
      })
      .catch(() => {
        // dropdowns/name lookups degrade gracefully - not worth surfacing as a page error
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    let cancelled = false;
    getBills(token)
      .then((res) => {
        if (!cancelled) setBills(res);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          err instanceof ApiError ? err.message : "Failed to load bills.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey, uploadVersion]);

  const vendorNames = useMemo(
    () => new Map(vendors.map((v) => [v.id, v.name])),
    [vendors],
  );
  const categoryNames = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories],
  );

  const filteredBills = useMemo(() => {
    if (!bills) return [];
    const query = search.trim().toLowerCase();
    return bills.filter((bill) => {
      if (startDate && (!bill.issue_date || bill.issue_date < startDate))
        return false;
      if (endDate && (!bill.issue_date || bill.issue_date > endDate))
        return false;
      if (vendorId && bill.vendor_id !== vendorId) return false;
      if (categoryId && bill.category_id !== categoryId) return false;
      if (status && bill.status !== status) return false;
      if (
        query &&
        !bill.name.toLowerCase().includes(query) &&
        !(bill.invoice_number ?? "").toLowerCase().includes(query)
      )
        return false;
      return true;
    });
  }, [bills, startDate, endDate, vendorId, categoryId, status, search]);

  if (error) {
    // Not ComingSoon - its "coming soon" copy would misrepresent a real fetch failure as an
    // unbuilt feature.
    return (
      <p className="text-sm text-destructive">
        Couldn&apos;t load bills: {error}
      </p>
    );
  }

  if (!bills) return <BillsSkeleton />;

  return (
    <div className="flex flex-col gap-6 pt-4">
      <PageHeader
        icon={ClipboardList}
        title="Bills Explorer"
        description="Every bill you've uploaded"
        actions={
          <BillUploadButton onUploaded={() => setRefreshKey((k) => k + 1)} />
        }
      />
      <BillFilters
        vendors={vendors}
        categories={categories}
        startDate={startDate}
        endDate={endDate}
        vendorId={vendorId}
        categoryId={categoryId}
        status={status}
        search={search}
        onStartDateChange={setStartDate}
        onEndDateChange={setEndDate}
        onVendorIdChange={setVendorId}
        onCategoryIdChange={setCategoryId}
        onStatusChange={setStatus}
        onSearchChange={setSearch}
        onClear={() => {
          setStartDate("");
          setEndDate("");
          setVendorId("");
          setCategoryId("");
          setStatus("");
          setSearch("");
        }}
      />
      <BillsTable
        rows={filteredBills}
        vendors={vendors}
        categories={categories}
        vendorNames={vendorNames}
        categoryNames={categoryNames}
        onChanged={() => setRefreshKey((k) => k + 1)}
      />
    </div>
  );
}
