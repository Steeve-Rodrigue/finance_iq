import {
  ArrowRight,
  Lightbulb,
  Sparkles,
  Upload as UploadIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { DemoButton } from "@/components/landing/demo-button";
import { buttonVariants } from "@/components/ui/button";

const STEPS = [
  { label: "Upload", icon: UploadIcon },
  { label: "Analyze", icon: Sparkles },
  { label: "Understand", icon: Lightbulb },
];

// The public-facing landing page - now the actual "/" route (sign-in/signup moved to
// /login). Two background images (public/desktop.jpg, public/phone.jpg) swapped by the same
// `md` breakpoint (850px) the rest of the dashboard uses, rather than one image stretched/
// cropped awkwardly across both shapes. Deliberately minimal for now - more sections land
// progressively on top of this.
//
// Layout follows docs/image.png's reference: hero copy pinned to the left column at md+ (not
// centered) - the right half is left empty on purpose, reserved for an animation that isn't
// built yet. The left-to-right white->transparent gradient already does double duty as both
// text-legibility contrast and the visual "left column" boundary.
export default function LandingPage() {
  return (
    <div className="relative flex min-h-screen w-full flex-col overflow-hidden">
      <Image
        src="/desktop.jpg"
        alt=""
        fill
        priority
        sizes="100vw"
        className="hidden object-cover md:block"
      />
      <Image
        src="/phone.jpg"
        alt=""
        fill
        priority
        sizes="100vw"
        className="block object-cover md:hidden"
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-r from-white via-white/70 to-transparent"
      />

      {/* md+: an actual 70/30 grid split (fr units, so it's a true proportion of the
          viewport at any width, not a fixed-pixel offset that looks fine at one size and
          wrong at another) - hero copy lives in the left 70% cell, the right 30% cell stays
          empty, reserved for the animation. Type scale and spacing grow with the breakpoints
          too (not just the container), so the block actually fills that 70% instead of
          floating as a small fixed-size island inside it. */}
      <div className="relative z-10 flex flex-1 items-center md:items-start">
        <div className="grid w-full md:grid-cols-[4fr_3fr]">
          <div className="mx-auto flex w-full max-w-lg flex-col items-center px-6 py-16 text-center sm:pr-10 sm:pl-10 md:mx-auto md:max-w-2xl md:items-center md:py-1 md:px-8! md:pt-16! md:text-center xl:max-w-4xl xl:px-50! xl:pt-30!">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs font-semibold tracking-wide text-primary uppercase md:px-4 md:py-1.5 md:text-sm xl:px-5 xl:py-2 xl:text-base">
              <span className="size-1.5 rounded-full bg-primary md:size-2 xl:size-2.5" />
              Agentic AI · Bill Tracking
            </span>

            <h1 className="mt-6 text-5xl font-extrabold tracking-tight text-foreground sm:text-6xl md:mt-8 md:text-7xl xl:mt-10 xl:text-8xl">
              Finance<span className="text-primary">IQ</span>
            </h1>

            <p className="mt-3 text-lg text-primary/80 italic md:mt-4 md:text-xl xl:mt-5 xl:text-2xl">
              Agentic intelligence for every bill you upload.
            </p>

            <h2 className="mt-6 text-3xl font-bold text-foreground sm:text-4xl md:mt-8 md:text-5xl xl:mt-10 xl:text-6xl">
              Every bill, finally understood.
            </h2>

            <p className="mt-6 max-w-md text-base leading-relaxed text-muted-foreground md:mt-8 md:max-w-lg md:text-lg xl:mt-10 xl:max-w-xl xl:text-xl">
              FinanceIQ&apos;s agents parse, categorize, and audit every bill.
              Asking you directly whenever they aren&apos;t confident, instead
              of guessing.
            </p>

            <div className="mt-6 flex flex-nowrap items-center justify-center gap-1 text-xs font-semibold text-foreground sm:gap-2.5 sm:text-sm md:mt-10 md:text-base xl:mt-12 xl:text-lg">
              {STEPS.map(({ label, icon: Icon }, i) => (
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
                  <span className="flex items-center gap-1.5 rounded-full border border-primary/25 bg-card/70 px-2 py-0.5 whitespace-nowrap shadow-sm sm:px-3 sm:py-1.5 md:gap-2 md:px-4 md:py-2 xl:px-5 xl:py-2.5">
                    <Icon
                      aria-hidden
                      className="hidden size-3.5 shrink-0 text-primary sm:block md:size-4 xl:size-5"
                    />
                    {label}
                  </span>
                </span>
              ))}
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3 md:mt-10 xl:mt-12 xl:gap-4">
              <Link
                href="/login"
                className={buttonVariants({
                  className:
                    "h-11 gap-2 px-6 text-base md:h-12 xl:h-14 xl:px-8 xl:text-lg",
                })}
              >
                Sign in
                <ArrowRight className="size-4 xl:size-5" />
              </Link>
              <Link
                href="/login"
                className={buttonVariants({
                  variant: "outline",
                  className:
                    "h-11 px-6 text-base md:h-12 xl:h-14 xl:px-8 xl:text-lg",
                })}
              >
                Sign up
              </Link>
              <DemoButton />
            </div>
          </div>
          <div aria-hidden className="hidden md:block" />
        </div>
      </div>
    </div>
  );
}
