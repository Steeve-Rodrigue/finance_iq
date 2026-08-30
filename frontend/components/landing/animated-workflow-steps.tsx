"use client";

import {
  ArrowRight,
  Lightbulb,
  Sparkles,
  Upload as UploadIcon,
} from "lucide-react";
import { useEffect, useState } from "react";

const STEPS = [
  { label: "Upload", icon: UploadIcon },
  { label: "Analyze", icon: Sparkles },
  { label: "Understand", icon: Lightbulb },
];

const INTERVAL_MS = 1500;

// Cycles which chip reads as "active" (filled, scaled up) so the Upload -> Analyze ->
// Understand row shows the pipeline actually moving instead of sitting as three static
// chips - the same phase-cycling idea as the desktop InsightsAnimation and the phone-only
// LiveStatusPill above the hero heading, applied here to a row that already existed.
export function AnimatedWorkflowSteps() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setActive((i) => (i + 1) % STEPS.length);
    }, INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="mt-6 flex flex-nowrap items-center justify-center gap-1 text-xs font-semibold text-foreground sm:gap-2.5 sm:text-sm md:mt-10 md:text-sm xl:mt-12 xl:text-base">
      {STEPS.map(({ label, icon: Icon }, i) => {
        const isActive = i === active;
        return (
          <span
            key={label}
            className="flex shrink-0 items-center gap-1 sm:gap-2.5"
          >
            {i > 0 && (
              <ArrowRight
                aria-hidden
                className="size-3 shrink-0 text-primary/50 sm:size-4 md:size-5"
              />
            )}
            <span
              className={`flex items-center gap-1 rounded-full border px-2 py-0.5 whitespace-nowrap shadow-sm transition-all duration-500 sm:gap-1.5 sm:px-3 sm:py-1.5 md:gap-2 md:px-4 md:py-2 xl:px-5 xl:py-2.5 ${
                isActive
                  ? "scale-105 border-primary bg-primary text-primary-foreground shadow-md"
                  : "border-primary/25 bg-card/70 text-foreground"
              }`}
            >
              <Icon
                aria-hidden
                className={`hidden size-3.5 shrink-0 transition-colors duration-500 sm:block md:size-4 xl:size-5 ${
                  isActive ? "text-primary-foreground" : "text-primary"
                }`}
              />
              {label}
            </span>
          </span>
        );
      })}
    </div>
  );
}
