"use client";

import { useState } from "react";
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
import { ApiError, deleteVendor } from "@/lib/api";
import { getToken } from "@/lib/auth";

type VendorDeleteDialogProps = {
  vendorId: string;
  vendorName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
};

// frontend/CLAUDE.md's Vendors "delete (with confirmation, blocked if bills linked)" action.
// The Delete button is a plain onClick handler, not a DialogClose - a 409 (bills still
// reference this vendor, see backend/app/services/vendors_service.py's delete_vendor) must
// keep the dialog open with the error visible, not auto-close like Cancel does.
export function VendorDeleteDialog({
  vendorId,
  vendorName,
  open,
  onOpenChange,
  onDeleted,
}: VendorDeleteDialogProps) {
  const [deleting, setDeleting] = useState(false);

  function handleDelete() {
    const token = getToken();
    if (!token) return;
    setDeleting(true);
    deleteVendor(token, vendorId)
      .then(() => {
        toast.success(`${vendorName} deleted`);
        onDeleted();
        onOpenChange(false);
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 409) {
          toast.error(
            "This vendor still has bills linked to it and can't be deleted.",
          );
          return;
        }
        toast.error(
          err instanceof ApiError ? err.message : "Failed to delete vendor.",
        );
      })
      .finally(() => setDeleting(false));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {vendorName}?</DialogTitle>
          <DialogDescription>
            This permanently deletes the vendor. Bills already linked to it will
            block the deletion until they&apos;re reassigned or removed.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose
            render={
              <Button type="button" variant="outline" disabled={deleting}>
                Cancel
              </Button>
            }
          />
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? "Deleting..." : "Delete vendor"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
