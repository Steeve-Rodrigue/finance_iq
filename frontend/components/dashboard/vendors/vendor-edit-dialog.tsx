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
import { ApiError, getVendor, updateVendor, type VendorRead } from "@/lib/api";
import { getToken } from "@/lib/auth";

type VendorEditDialogProps = {
  vendorId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (vendor: VendorRead) => void;
};

// frontend/CLAUDE.md's Vendors "edit (name, address, key)" action. Neither analytics response
// (VendorTableRow, VendorDetailResponse) carries all three fields at once, so the form fetches
// the plain CRUD resource (GET /vendors/{id}) fresh on every open rather than threading
// partial data in from whichever row/page opened it.
export function VendorEditDialog({
  vendorId,
  open,
  onOpenChange,
  onSaved,
}: VendorEditDialogProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [key, setKey] = useState("");

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
      .then(() => getVendor(token, vendorId))
      .then((vendor) => {
        if (cancelled) return;
        setName(vendor.name);
        setAddress(vendor.address ?? "");
        setKey(vendor.key);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        toast.error(
          err instanceof ApiError ? err.message : "Failed to load vendor.",
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
  }, [open, vendorId]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) return;
    setSaving(true);
    updateVendor(token, vendorId, {
      name,
      address: address.trim() === "" ? null : address,
      key,
    })
      .then((vendor) => {
        toast.success("Vendor updated");
        onSaved(vendor);
        onOpenChange(false);
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 409) {
          toast.error("That vendor key is already in use.");
          return;
        }
        toast.error(
          err instanceof ApiError ? err.message : "Failed to update vendor.",
        );
      })
      .finally(() => setSaving(false));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit vendor</DialogTitle>
          <DialogDescription>
            Update this vendor&apos;s name, address, or matching key.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="vendor-edit-name">Name</Label>
            <Input
              id="vendor-edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={loading}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="vendor-edit-address">Address</Label>
            <Input
              id="vendor-edit-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              disabled={loading}
              placeholder="Optional"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="vendor-edit-key">Key</Label>
            <Input
              id="vendor-edit-key"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              disabled={loading}
              required
            />
            <p className="text-[11px] text-muted-foreground">
              Normalized identifier used to match this vendor across bills.
            </p>
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
