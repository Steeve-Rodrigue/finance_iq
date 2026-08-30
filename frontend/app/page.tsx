import { ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { AnimatedWorkflowSteps } from "@/components/landing/animated-workflow-steps";
import { DemoButton } from "@/components/landing/demo-button";
import { InsightsAnimation } from "@/components/landing/insights-animation";
import { buttonVariants } from "@/components/ui/button";

// The public-facing landing page - now the actual "/" route (sign-in/signup moved to
// /login). Two background images (public/desktop.jpg, public/phone.jpg) swapped by the same
// `md` breakpoint (850px) the rest of the dashboard uses, rather than one image stretched/
// cropped awkwardly across both shapes. Deliberately minimal for now - more sections land
// progressively on top of this.
//
// Layout follows docs/image.png's reference: hero copy pinned to the left column at md+ (not
// centered), InsightsAnimation (components/landing/insights-animation.tsx) in the right
// column. The left-to-right white->transparent gradient already does double duty as both
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
      <div className="relative z-10 flex flex-1 items-center md:items-stretch">
        <div className="grid w-full md:grid-cols-[4.5fr_3fr]">
          <div className="mx-auto flex w-full max-w-lg flex-col items-center px-14 py-16 text-center md:mx-auto md:max-w-2xl md:items-center md:py-1 md:px-8! md:pt-16! md:text-center xl:max-w-4xl xl:px-50! xl:pt-35!">
            <h1 className="text-4xl font-extrabold tracking-tight text-foreground sm:text-6xl md:text-6xl xl:text-7xl">
              Finance<span className="text-primary">IQ</span>
            </h1>
            <p className="mt-3 text-base text-primary/80 italic md:mt-4 md:text-lg xl:mt-5 xl:text-xl">
              Agentic intelligence for every bill you upload.
            </p>

            <h2 className="mt-6 text-2xl font-bold text-foreground sm:text-4xl md:mt-8 md:text-4xl xl:mt-10 xl:text-5xl">
              Every bill, finally understood.
            </h2>

            <p className="mt-6 max-w-md text-sm leading-relaxed text-muted-foreground md:mt-8 md:max-w-lg md:text-base xl:mt-10 xl:max-w-xl xl:text-lg">
              FinanceIQ&apos;s agents parse, categorize, and audit every bill.
              Asking you directly whenever they aren&apos;t confident, instead
              of guessing. Try the demo below to see how it works.
            </p>

            <AnimatedWorkflowSteps />

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3 md:mt-10 xl:mt-12 xl:gap-4">
              {/* One "Start" CTA instead of separate Sign in / Sign up buttons - both used to
                  point at the same /login page anyway (its own form has both as tabs), so two
                  buttons for the same destination was redundant. */}
              <Link
                href="/login"
                className={buttonVariants({
                  className:
                    "h-10 gap-1.5 px-4 text-sm md:h-12 md:gap-2 md:px-6 md:text-sm xl:h-14 xl:px-8 xl:text-base",
                })}
              >
                Start
                <ArrowRight className="size-4 xl:size-5" />
              </Link>
              <DemoButton />
            </div>
          </div>
          <div
            aria-hidden
            className="hidden items-center justify-start md:flex md:py-4 md:pr-8 md:pl-0 xl:pr-12 xl:pl-0"
          >
            <InsightsAnimation className="h-[70%] w-[80%] max-w-xl xl:max-w-2xl" />
          </div>
        </div>
      </div>
    </div>
  );
}
