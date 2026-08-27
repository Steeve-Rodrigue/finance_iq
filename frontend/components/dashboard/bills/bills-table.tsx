"use client";

import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { BillDeleteDialog } from "@/components/dashboard/bills/bill-delete-dialog";
import { ConfidenceBadge } from "@/components/dashboard/confidence-badge";
import { ChartCard } from "@/components/dashboard/overview/chart-card";
import type { BillRead } from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 15;

// backend/app/models/bills.py's BillStatus - "resolved" reads as done/settled, "flagged"
// needs attention, "archived" is put away; everything else (pending/in_review) is still
// moving through the pipeline and gets a neutral in-progress treatment. Same convention as
// vendor-bills-history-table.tsx's StatusPill.
const STATUS_STYLES: Record<string, string> = {
  resolved: "bg-emerald-500/10 text-emerald-600",
  flagged: "bg-red-500/10 text-red-600",
  archived: "bg-muted text-muted-foreground",
};

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium capitalize",
        STATUS_STYLES[status] ?? "bg-amber-500/10 text-amber-600",
      )}
    >
      {status.replace("_", " ")}
    </span>
  );
}

type SortKey =
  | "name"
  | "vendor"
  | "total_amount"
  | "issue_date"
  | "status"
  | "confidence"
  | "category";

type Column = { key: SortKey; label: string };

const COLUMNS: Column[] = [
  { key: "name", label: "Name" },
  { key: "vendor", label: "Vendor" },
  { key: "total_amount", label: "Amount" },
  { key: "issue_date", label: "Issue date" },
  { key: "status", label: "Status" },
  { key: "confidence", label: "Confidence" },
  { key: "category", label: "Category" },
];

type BillsTableProps = {
  rows: BillRead[];
  vendorNames: Map<string, string>;
  categoryNames: Map<string, string>;
  onChanged: () => void;
  className?: string;
};

function sortValue(
  row: BillRead,
  key: SortKey,
  vendorNames: Map<string, string>,
  categoryNames: Map<string, string>,
): string | number {
  switch (key) {
    case "name":
      return row.name.toLowerCase();
    case "vendor":
      return (
        (row.vendor_id && vendorNames.get(row.vendor_id)) ||
        row.vendor_name_raw ||
        ""
      ).toLowerCase();
    case "total_amount":
      return row.total_amount ? Number(row.total_amount) : -Infinity;
    case "issue_date":
      // Nulls sort last regardless of direction - treated as "no date" rather than "oldest".
      return row.issue_date ?? "";
    case "status":
      return row.status;
    case "confidence":
      return row.confidence ? Number(row.confidence) : -Infinity;
    case "category":
      return (
        (row.category_id && categoryNames.get(row.category_id)) ||
        ""
      ).toLowerCase();
  }
}

// frontend/CLAUDE.md's Bills Explorer table: name (clickable -> Bill Detail), vendor, amount
// (+ currency), issue date, status, confidence, category. Sortable + paginated, both
// client-side (see bill-filters.tsx's comment on why - GET /bills/ has no query params at
// all). Name isn't a link yet - Bill Detail is a separate, not-yet-built page (same deferral
// as RecentUploads/VendorBillsHistoryTable elsewhere in this app).
export function BillsTable({
  rows,
  vendorNames,
  categoryNames,
  onChanged,
  className,
}: BillsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("issue_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deletingBill, setDeletingBill] = useState<{
    id: string;
    name: string;
  } | null>(null);

  // Filters/search changing hand this component a brand-new `rows` array - reset back to
  // page 1 and clear any selection (a previously-selected bill may no longer match the new
  // filters) rather than leaving stale state around. Adjusted during render (React's own
  // recommended pattern for "state that depends on a prop change"), not in a useEffect - a
  // setState call here just makes React immediately re-render with the corrected state before
  // painting, no extra commit/flicker.
  const [prevRows, setPrevRows] = useState(rows);
  if (rows !== prevRows) {
    setPrevRows(rows);
    setPage(1);
    setSelectedIds(new Set());
  }

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = sortValue(a, sortKey, vendorNames, categoryNames);
      const bv = sortValue(b, sortKey, vendorNames, categoryNames);
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortKey, sortDir, vendorNames, categoryNames]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paged = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Selection can span multiple pages, so the total is computed against all of `rows`, not
  // just `paged` - selecting bills on page 1, flipping to page 2, and selecting more should
  // add up, not reset.
  const selectedBills = useMemo(
    () => rows.filter((bill) => selectedIds.has(bill.id)),
    [rows, selectedIds],
  );
  const selectedTotal = useMemo(
    () =>
      selectedBills.reduce(
        (sum, bill) =>
          sum + (bill.total_amount ? Number(bill.total_amount) : 0),
        0,
      ),
    [selectedBills],
  );

  const allOnPageSelected =
    paged.length > 0 && paged.every((bill) => selectedIds.has(bill.id));
  const someOnPageSelected = paged.some((bill) => selectedIds.has(bill.id));
  const headerCheckboxRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate =
        someOnPageSelected && !allOnPageSelected;
    }
  }, [someOnPageSelected, allOnPageSelected]);

  function toggleBill(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function togglePage() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) {
        for (const bill of paged) next.delete(bill.id);
      } else {
        for (const bill of paged) next.add(bill.id);
      }
      return next;
    });
  }

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  return (
    <ChartCard
      title="Bills"
      subtitle={`${rows.length} bill${rows.length === 1 ? "" : "s"}`}
      className={className}
    >
      {rows.length === 0 ? (
        <div className="flex h-[160px] items-center justify-center text-xs text-muted-foreground">
          No bills match these filters
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-[11px] text-muted-foreground">
                  <th className="w-8 pb-2 font-medium">
                    <input
                      ref={headerCheckboxRef}
                      type="checkbox"
                      checked={allOnPageSelected}
                      onChange={togglePage}
                      aria-label="Select all bills on this page"
                      className="size-3.5 rounded border-border accent-primary"
                    />
                  </th>
                  {COLUMNS.map((col) => (
                    <th key={col.key} className="pb-2 font-medium">
                      <button
                        type="button"
                        onClick={() => handleSort(col.key)}
                        className="flex items-center gap-1 hover:text-foreground"
                      >
                        {col.label}
                        {sortKey === col.key ? (
                          sortDir === "asc" ? (
                            <ArrowUp className="size-3" />
                          ) : (
                            <ArrowDown className="size-3" />
                          )
                        ) : (
                          <ArrowUpDown className="size-3 opacity-40" />
                        )}
                      </button>
                    </th>
                  ))}
                  <th className="pb-2 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {paged.map((bill) => (
                  <tr
                    key={bill.id}
                    className="border-t border-border/60 text-foreground"
                  >
                    <td className="py-2">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(bill.id)}
                        onChange={() => toggleBill(bill.id)}
                        aria-label={`Select ${bill.name}`}
                        className="size-3.5 rounded border-border accent-primary"
                      />
                    </td>
                    <td className="max-w-[160px] truncate py-2 font-medium">
                      {bill.name}
                    </td>
                    <td className="max-w-[140px] truncate py-2 text-muted-foreground">
                      {(bill.vendor_id && vendorNames.get(bill.vendor_id)) ||
                        bill.vendor_name_raw ||
                        "—"}
                    </td>
                    <td className="py-2">
                      {bill.total_amount ? (
                        <>
                          {formatCurrency(bill.total_amount, { precise: true })}
                          {bill.currency && bill.currency !== "EUR" && (
                            <span className="ml-1 text-[10px] text-muted-foreground">
                              {bill.currency}
                            </span>
                          )}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2 text-muted-foreground">
                      {bill.issue_date
                        ? new Intl.DateTimeFormat("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          }).format(new Date(bill.issue_date))
                        : "—"}
                    </td>
                    <td className="py-2">
                      <StatusPill status={bill.status} />
                    </td>
                    <td className="py-2">
                      <ConfidenceBadge value={bill.confidence} />
                    </td>
                    <td className="max-w-[120px] truncate py-2 text-muted-foreground">
                      {(bill.category_id &&
                        categoryNames.get(bill.category_id)) ||
                        "Uncategorized"}
                    </td>
                    <td className="py-2">
                      <button
                        type="button"
                        onClick={() =>
                          setDeletingBill({ id: bill.id, name: bill.name })
                        }
                        className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        aria-label={`Delete ${bill.name}`}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="mt-3 flex items-center justify-between gap-2">
              <p className="text-[11px] text-muted-foreground">
                Page {page} of {totalPages}
              </p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                  aria-label="Next page"
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>
            </div>
          )}
          {/* Selection total - spans however many pages the selection was made across (see
              selectedBills/selectedTotal above), not just what's currently on screen. */}
          {selectedBills.length > 0 && (
            <div className="mt-3 flex items-center justify-between gap-2 rounded-lg bg-primary/5 px-3 py-2">
              <p className="text-xs font-medium text-foreground">
                {selectedBills.length} bill
                {selectedBills.length === 1 ? "" : "s"} selected
              </p>
              <p className="text-xs font-semibold text-foreground">
                Total: {formatCurrency(selectedTotal, { precise: true })}
              </p>
            </div>
          )}
        </>
      )}
      <BillDeleteDialog
        billId={deletingBill?.id ?? ""}
        billName={deletingBill?.name ?? ""}
        open={deletingBill !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingBill(null);
        }}
        onDeleted={onChanged}
      />
    </ChartCard>
  );
}
