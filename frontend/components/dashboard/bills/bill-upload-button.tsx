"use client";

import { Upload } from "lucide-react";
import { useRef } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ApiError, uploadBills } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { useUploadProgress } from "@/lib/upload-progress-context";

// A literal filling pie (conic-gradient wedge) - same treatment as the sidebar's global
// upload button (components/dashboard/sidebar.tsx's UploadPie), for real byte-level upload
// progress from XHR's upload.onprogress (lib/api.ts's uploadBills).
function UploadPie({ percent }: { percent: number }) {
  return (
    <span
      className="size-4 shrink-0 rounded-full"
      style={{
        background: `conic-gradient(var(--primary-foreground) ${percent}%, color-mix(in srgb, var(--primary-foreground) 30%, transparent) 0)`,
      }}
    />
  );
}

type BillUploadButtonProps = {
  onUploaded: () => void;
};

// frontend/CLAUDE.md's Bills Explorer "Upload new bill button (top of page)". The sidebar
// already has a global uploader (accessible from every page), but it has no way to tell this
// page's list to refetch - this is a second, page-local uploader using the same
// lib/api.ts::uploadBills, so a successful upload here refreshes the table it was uploaded
// into.
export function BillUploadButton({ onUploaded }: BillUploadButtonProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploading, progress, beginUpload, setProgress, endUpload } =
    useUploadProgress();

  async function handleFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // allow re-selecting the same file(s) on a later upload
    if (files.length === 0) return;

    const token = getToken();
    if (!token) return;

    beginUpload();
    try {
      const results = await uploadBills(token, files, setProgress);
      let anySucceeded = false;
      for (const result of results) {
        if (result.error) {
          toast.error(`${result.filename}: ${result.error}`);
        } else {
          toast.success(`${result.filename} uploaded`);
          anySucceeded = true;
        }
      }
      if (anySucceeded) onUploaded();
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : "Upload failed.");
    } finally {
      endUpload();
    }
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        multiple
        className="hidden"
        onChange={handleFilesSelected}
      />
      <Button
        size="sm"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
      >
        {uploading ? <UploadPie percent={progress} /> : <Upload />}
        {uploading ? `Uploading ${progress}%` : "Upload bill"}
      </Button>
    </>
  );
}
