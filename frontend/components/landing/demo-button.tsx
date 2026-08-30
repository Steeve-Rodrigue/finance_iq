"use client";

import { PlayCircle } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

// Sends the visitor to the bill-picker (app/demo/page.tsx) rather than straight into
// /dashboard - that page is what actually seeds the demo store and sets the session token
// (see its own header comment), once the visitor has chosen which of the mock dataset's bills
// to load.
export function DemoButton() {
  return (
    <Link
      href="/demo"
      className={buttonVariants({
        variant: "outline",
        className:
          "h-10 gap-1.5 px-4 text-sm md:h-12 md:gap-2 md:px-6 md:text-sm xl:h-14 xl:px-8 xl:text-base",
      })}
    >
      <PlayCircle className="size-3.5 md:size-4" />
      Try the demo
    </Link>
  );
}
