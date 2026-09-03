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
// A single determinate percentage for the whole wait, nothing more - lib/progress-simulation.ts
// already covers the entire span (both the request itself and the real server-side parsing
// that follows, which has no real progress signal of its own) with one continuously-increasing
// number, all the way up to the real 100% reported once the response actually arrives (see
// lib/api.ts's uploadBills and lib/demo/demo-upload.ts's demoUploadBills). There used to be a
// separate "processing" phase here that specifically intercepted any reported percent >= 100
// and switched to an indeterminate spinner instead of showing it - that was built for an
// earlier design where real XHR byte-upload progress reached 100% within a fraction of a
// second, long before the server had actually finished, leaving a real gap with no signal to
// show a number for. That's no longer true: onProgress is only ever called with 100 once, at
// the point of genuine completion, so treating it as anything other than real data actively
// fought the simulation instead of complementing it.
const DONE_DISPLAY_MS = 500;

type UploadProgressContextValue = {
  uploading: boolean;
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
  const [progress, setProgressState] = useState(0);
  const [uploadVersion, setUploadVersion] = useState(0);

  const beginUpload = useCallback(() => {
    setUploading(true);
    setProgressState(0);
  }, []);
  const setProgress = useCallback((percent: number) => {
    setProgressState(percent);
  }, []);
  const endUpload = useCallback(() => {
    // The server has actually responded now - show a real, brief 100% (onProgress(100) from
    // uploadBills/demoUploadBills has usually already set this, but asserting it here too
    // means the overlay always ends at a real 100% even if a caller didn't pass onProgress
    // through, or the very last tick landed just under it) rather than just vanishing.
    setProgressState(100);
    setUploadVersion((v) => v + 1);
    setTimeout(() => setUploading(false), DONE_DISPLAY_MS);
  }, []);

  const value = useMemo(
    () => ({
      uploading,
      progress,
      beginUpload,
      setProgress,
      endUpload,
      uploadVersion,
    }),
    [uploading, progress, beginUpload, setProgress, endUpload, uploadVersion],
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
