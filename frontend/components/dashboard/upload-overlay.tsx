"use client";

import { useUploadProgress } from "@/lib/upload-progress-context";

const RADIUS = 42;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

// Full-page circular progress shown over the whole dashboard (sidebar included) while any
// upload is in flight. One determinate ring for the entire wait - lib/upload-progress-context.tsx
// no longer models a separate indeterminate "processing" phase, since
// lib/progress-simulation.ts's simulated percentage already covers the whole span (request +
// real server-side parsing) with one continuously-increasing number, so there's no longer a
// real gap with no signal to spin a placeholder arc for.
export function UploadOverlay() {
  const { uploading, progress } = useUploadProgress();

  if (!uploading) return null;

  const offset = CIRCUMFERENCE - (progress / 100) * CIRCUMFERENCE;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background/80 backdrop-blur-sm"
    >
      <div className="relative flex size-32 items-center justify-center xl:size-40">
        <svg viewBox="0 0 100 100" className="size-full -rotate-90">
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
            className="stroke-primary transition-[stroke-dashoffset] duration-200 ease-out"
          />
        </svg>
        <span className="absolute text-2xl font-extrabold text-foreground xl:text-3xl">
          {progress}%
        </span>
      </div>
      <p className="text-sm font-semibold text-foreground">
        {progress >= 100 ? "Upload complete" : "Uploading your bill…"}
      </p>
    </div>
  );
}
