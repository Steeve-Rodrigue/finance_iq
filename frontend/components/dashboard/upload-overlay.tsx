"use client";

import { useUploadProgress } from "@/lib/upload-progress-context";

const RADIUS = 42;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
// Indeterminate ring during "processing": a fixed quarter-circle arc that spins, rather than a
// specific percentage we don't actually have (see upload-progress-context.tsx).
const INDETERMINATE_ARC = CIRCUMFERENCE * 0.25;

// Full-page circular progress shown over the whole dashboard (sidebar included) while any
// upload is in flight. Two visually distinct rings, matching the two phases that are actually
// true: a filling ring for real, determinate byte-upload progress, and a spinning ring once
// that's done but the server (parsing/categorizing) hasn't responded yet - see
// lib/upload-progress-context.tsx for why those can't share one number.
export function UploadOverlay() {
  const { uploading, phase, progress } = useUploadProgress();

  if (!uploading) return null;

  const determinate = phase === "uploading" || phase === "done";
  const offset = determinate
    ? CIRCUMFERENCE - (progress / 100) * CIRCUMFERENCE
    : CIRCUMFERENCE - INDETERMINATE_ARC;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background/80 backdrop-blur-sm"
    >
      <div className="relative flex size-32 items-center justify-center xl:size-40">
        <svg
          viewBox="0 0 100 100"
          className={
            determinate
              ? "size-full -rotate-90"
              : "size-full -rotate-90 animate-spin"
          }
        >
          <circle
            cx="50"
            cy="50"
            r={RADIUS}
            fill="none"
            strokeWidth="8"
            className="stroke-muted"
          />
          <circle
            cx="50"
            cy="50"
            r={RADIUS}
            fill="none"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset}
            className={
              determinate
                ? "stroke-primary transition-[stroke-dashoffset] duration-200 ease-out"
                : "stroke-primary"
            }
          />
        </svg>
        {determinate && (
          <span className="absolute text-2xl font-extrabold text-foreground xl:text-3xl">
            {progress}%
          </span>
        )}
      </div>
      <p className="text-sm font-semibold text-foreground">
        {phase === "processing"
          ? "Processing your bill…"
          : phase === "done"
            ? "Upload complete"
            : "Uploading your bill…"}
      </p>
    </div>
  );
}
