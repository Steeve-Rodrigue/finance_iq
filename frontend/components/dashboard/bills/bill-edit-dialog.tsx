"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ApiError,
  getBill,
  updateBill,
  type BillRead,
  type CategoryRead,
  type VendorRead,
} from "@/lib/api";
import { getToken } from "@/lib/auth";

const STATUS_OPTIONS = [
  "pending",
  "in_review",
  "flagged",
  "resolved",
  "archived",
];
const PAYMENT_STATUS_OPTIONS = [
  "unpaid",
  "partial",
  "paid",
  "overdue",
  "disputed",
];

const selectClass =
  "h-8 rounded-lg border border-border bg-background px-2 text-sm text-foreground capitalize";

type BillEditDialogProps = {
  billId: string;
  vendors: VendorRead[];
  categories: CategoryRead[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (bill: BillRead) => void;
};

// frontend/CLAUDE.md's Bill Detail "Editable fields: name, invoice_number, issue_date,
// due_date, total_amount, category, vendor, payment_status, status" - exposed here as a
// row-level dialog on Bills Explorer since Bill Detail itself isn't built yet (see
// bills-table.tsx's comment on Name not being a link). The list's own BillRead is trimmed
// (no due_date/payment_status), so this fetches the full resource fresh on every open, same
// reasoning as VendorEditDialog/LineItemEditDialog.
export function BillEditDialog({
  billId,
  vendors,
  categories,
  open,
  onOpenChange,
  onSaved,
}: BillEditDialogProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [status, setStatus] = useState("pending");
  const [paymentStatus, setPaymentStatus] = useState("unpaid");

  useEffect(() => {
    if (!open) return;
    const token = getToken();
    if (!token) return;
    let cancelled = false;
    // setLoading(true) runs inside this first .then, not synchronously in the effect body, so
    // it's a reaction to the fetch starting rather than a direct effect-body setState call
    // (same pattern used throughout this app - see Overview's trendLoading).
    Promise.resolve()
      .then(() => {
        if (!cancelled) setLoading(true);
      })
      .then(() => getBill(token, billId))
      .then((bill) => {
        if (cancelled) return;
        setName(bill.name);
        setInvoiceNumber(bill.invoice_number ?? "");
        setIssueDate(bill.issue_date ?? "");
        setDueDate(bill.due_date ?? "");
        setTotalAmount(bill.total_amount ?? "");
        setCategoryId(bill.category_id ?? "");
        setVendorId(bill.vendor_id ?? "");
        setStatus(bill.status);
        setPaymentStatus(bill.payment_status);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        toast.error(
          err instanceof ApiError ? err.message : "Failed to load bill.",
        );
        onOpenChange(false);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-fetches on every open, not on onOpenChange identity changes
  }, [open, billId]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) return;
    setSaving(true);
    updateBill(token, billId, {
      name,
      invoice_number: invoiceNumber.trim() === "" ? null : invoiceNumber,
      issue_date: issueDate === "" ? null : issueDate,
      due_date: dueDate === "" ? null : dueDate,
      total_amount: totalAmount.trim() === "" ? null : totalAmount,
      category_id: categoryId === "" ? null : categoryId,
      vendor_id: vendorId === "" ? null : vendorId,
      status,
      payment_status: paymentStatus,
    })
      .then((bill) => {
        toast.success("Bill updated");
        onSaved(bill);
        onOpenChange(false);
      })
      .catch((err: unknown) => {
        toast.error(
          err instanceof ApiError ? err.message : "Failed to update bill.",
        );
      })
      .finally(() => setSaving(false));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit bill</DialogTitle>
          <DialogDescription>
            Update this bill&apos;s details.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bill-edit-name">Name</Label>
            <Input
              id="bill-edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={loading}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bill-edit-invoice">Invoice number</Label>
            <Input
              id="bill-edit-invoice"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              disabled={loading}
              placeholder="Optional"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bill-edit-issue-date">Issue date</Label>
              <Input
                id="bill-edit-issue-date"
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bill-edit-due-date">Due date</Label>
              <Input
                id="bill-edit-due-date"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bill-edit-total">Total amount</Label>
            <Input
              id="bill-edit-total"
              type="number"
              step="any"
              value={totalAmount}
              onChange={(e) => setTotalAmount(e.target.value)}
              disabled={loading}
              placeholder="Optional"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bill-edit-vendor">Vendor</Label>
              <select
                id="bill-edit-vendor"
                value={vendorId}
                onChange={(e) => setVendorId(e.target.value)}
                disabled={loading}
                className={selectClass}
              >
                <option value="">Unknown vendor</option>
                {vendors.map((vendor) => (
                  <option key={vendor.id} value={vendor.id}>
                    {vendor.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bill-edit-category">Category</Label>
              <select
                id="bill-edit-category"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                disabled={loading}
                className={selectClass}
              >
                <option value="">Uncategorized</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bill-edit-status">Status</Label>
              <select
                id="bill-edit-status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                disabled={loading}
                className={selectClass}
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option.replace("_", " ")}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bill-edit-payment-status">Payment status</Label>
              <select
                id="bill-edit-payment-status"
                value={paymentStatus}
                onChange={(e) => setPaymentStatus(e.target.value)}
                disabled={loading}
                className={selectClass}
              >
                {PAYMENT_STATUS_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <DialogClose
              render={
                <Button type="button" variant="outline" disabled={saving}>
                  Cancel
                </Button>
              }
            />
            <Button type="submit" disabled={loading || saving}>
              {saving ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
