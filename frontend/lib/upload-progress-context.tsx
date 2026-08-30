"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

// Shared across every upload trigger (sidebar's global uploader, Bills Explorer's page-local
// one) so a single full-page overlay (components/dashboard/upload-overlay.tsx) can reflect
// progress no matter which button started the upload, instead of each button only animating
// its own small icon.
//
// Three distinct phases, because XHR's upload.onprogress (lib/api.ts's uploadBills) only
// tracks the request *body* being sent - for a small PDF over a real network that reaches
// 100% in a fraction of a second, long before the server has actually finished. The real work
// (agentic parsing + categorization, real LLM calls) happens after that, server-side, with no
// progress signal at all - it can easily take 30-60s. Showing a frozen "100%" for that whole
// wait reads as finished when it isn't, so:
//   - "uploading": real, determinate, byte progress, capped below 100.
//   - "processing": the body finished sending but the server hasn't responded yet -
//     indeterminate (we have no real signal, so no fake number).
//   - "done": the server actually responded - the only point 100% is shown, briefly, before
//     the overlay closes on its own.
type UploadPhase = "uploading" | "processing" | "done";

const DONE_DISPLAY_MS = 500;

type UploadProgressContextValue = {
  uploading: boolean;
  phase: UploadPhase;
  progress: number;
  beginUpload: () => void;
  setProgress: (percent: number) => void;
  endUpload: () => void;
  // Increments every time an upload finishes (from ANY trigger - the sidebar's global
  // uploader has no direct reference to whatever page happens to be mounted, so it had no way
  // to tell that page's list to refetch; a page can add this to a fetch effect's dependency
  // array to pick up bills uploaded from the sidebar without the user having to navigate away
  // and back to see them).
  uploadVersion: number;
};

const UploadProgressContext = createContext<UploadProgressContextValue | null>(
  null,
);

export function UploadProgressProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [uploading, setUploading] = useState(false);
  const [phase, setPhase] = useState<UploadPhase>("uploading");
  const [progress, setProgressState] = useState(0);
  const [uploadVersion, setUploadVersion] = useState(0);

  const beginUpload = useCallback(() => {
    setUploading(true);
    setPhase("uploading");
    setProgressState(0);
  }, []);
  const setProgress = useCallback((percent: number) => {
    // The request body finished sending, but the server (parsing/categorizing) hasn't
    // responded yet - switch to the indeterminate spinner rather than sitting at a
    // misleading "100%".
    if (percent >= 100) {
      setPhase("processing");
      return;
    }
    setProgressState(percent);
  }, []);
  const endUpload = useCallback(() => {
    // The server has actually responded now - show a real, brief 100% rather than just
    // vanishing out of the indeterminate spinner.
    setPhase("done");
    setProgressState(100);
    setUploadVersion((v) => v + 1);
    setTimeout(() => setUploading(false), DONE_DISPLAY_MS);
  }, []);

  const value = useMemo(
    () => ({
      uploading,
      phase,
      progress,
      beginUpload,
      setProgress,
      endUpload,
      uploadVersion,
    }),
    [
      uploading,
      phase,
      progress,
      beginUpload,
      setProgress,
      endUpload,
      uploadVersion,
    ],
  );

  return (
    <UploadProgressContext.Provider value={value}>
      {children}
    </UploadProgressContext.Provider>
  );
}

export function useUploadProgress(): UploadProgressContextValue {
  const ctx = useContext(UploadProgressContext);
  if (!ctx) {
    throw new Error(
      "useUploadProgress must be used within UploadProgressProvider",
    );
  }
  return ctx;
}
