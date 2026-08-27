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
  getLineItem,
  updateLineItem,
  type BillLineItemRead,
  type CategoryRead,
} from "@/lib/api";
import { getToken } from "@/lib/auth";

type LineItemEditDialogProps = {
  billId: string;
  lineItemId: string;
  categories: CategoryRead[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (lineItem: BillLineItemRead) => void;
};

// frontend/CLAUDE.md's Line Items table "edit (description, common_name, quantity,
// unit_price, category)" row action. The analytics row this table renders
// (LineItemTableRow) has category_name but not category_id, so this fetches the plain CRUD
// resource (GET /bills/{bill_id}/line-items/{id}) fresh on open, same reasoning as
// VendorEditDialog/CategoryFormDialog.
export function LineItemEditDialog({
  billId,
  lineItemId,
  categories,
  open,
  onOpenChange,
  onSaved,
}: LineItemEditDialogProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [description, setDescription] = useState("");
  const [commonName, setCommonName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [categoryId, setCategoryId] = useState("");

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
      .then(() => getLineItem(token, billId, lineItemId))
      .then((item) => {
        if (cancelled) return;
        setDescription(item.description);
        setCommonName(item.common_name ?? "");
        setQuantity(item.quantity ?? "");
        setUnitPrice(item.unit_price ?? "");
        setCategoryId(item.category_id ?? "");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        toast.error(
          err instanceof ApiError ? err.message : "Failed to load line item.",
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
  }, [open, billId, lineItemId]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) return;
    setSaving(true);
    updateLineItem(token, billId, lineItemId, {
      description,
      common_name: commonName.trim() === "" ? null : commonName,
      quantity: quantity.trim() === "" ? null : quantity,
      unit_price: unitPrice.trim() === "" ? null : unitPrice,
      category_id: categoryId === "" ? null : categoryId,
    })
      .then((item) => {
        toast.success("Line item updated");
        onSaved(item);
        onOpenChange(false);
      })
      .catch((err: unknown) => {
        toast.error(
          err instanceof ApiError ? err.message : "Failed to update line item.",
        );
      })
      .finally(() => setSaving(false));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit line item</DialogTitle>
          <DialogDescription>
            Update this line item&apos;s details.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="line-item-description">Description</Label>
            <Input
              id="line-item-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={loading}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="line-item-common-name">Common name</Label>
            <Input
              id="line-item-common-name"
              value={commonName}
              onChange={(e) => setCommonName(e.target.value)}
              disabled={loading}
              placeholder="Optional"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="line-item-quantity">Quantity</Label>
              <Input
                id="line-item-quantity"
                type="number"
                step="any"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                disabled={loading}
                placeholder="Optional"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="line-item-unit-price">Unit price</Label>
              <Input
                id="line-item-unit-price"
                type="number"
                step="any"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                disabled={loading}
                placeholder="Optional"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="line-item-category">Category</Label>
            <select
              id="line-item-category"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              disabled={loading}
              className="h-8 rounded-lg border border-border bg-background px-2 text-sm text-foreground"
            >
              <option value="">Uncategorized</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
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
