"use client";

import { PlayCircle } from "lucide-react";
import { toast } from "sonner";

import { buttonVariants } from "@/components/ui/button";

// Anticipates frontend/CLAUDE.md's Phase 5 "seeded demo account with deliberately ambiguous
// bills" - not built yet, so this can't log anyone into a real demo account. The button is
// real now (not a dead/fake link) so the landing page's shape is right ahead of that backend
// work; clicking it is honest about not being ready yet instead of silently doing nothing or
// routing somewhere misleading.
export function DemoButton() {
  return (
    <button
      type="button"
      onClick={() =>
        toast.info("The live demo is coming soon - check back shortly.")
      }
      className={buttonVariants({
        variant: "outline",
        className:
          "h-10 gap-1.5 px-4 text-sm md:h-12 md:gap-2 md:px-6 md:text-sm xl:h-14 xl:px-8 xl:text-base",
      })}
    >
      <PlayCircle className="size-3.5 md:size-4" />
      Try the demo
    </button>
  );
}
