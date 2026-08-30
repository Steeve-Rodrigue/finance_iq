"use client";

import { ArrowLeft, PlayCircle } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { setToken } from "@/lib/auth";
import { createSeedBills, createSeedVendors } from "@/lib/demo/demo-data";
import { DEMO_TOKEN } from "@/lib/demo/demo-mode";
import { resetDemoStore } from "@/lib/demo/demo-store";
import { formatCurrency } from "@/lib/format";

const VENDOR_NAME_BY_ID = new Map(
  createSeedVendors().map((v) => [v.id, v.name]),
);

// Sorted newest-first purely for a nicer picker order - has no bearing on how the store seeds
// once picked (demo-store.ts's seedStore keeps whatever subset of ids it's given).
const PICKER_BILLS = createSeedBills()
  .slice()
  .sort((a, b) => (b.issue_date ?? "").localeCompare(a.issue_date ?? ""))
  .map((b) => ({
    id: b.id,
    name: b.name,
    vendorName: b.vendor_id
      ? (VENDOR_NAME_BY_ID.get(b.vendor_id) ?? "Unknown vendor")
      : "Unknown vendor",
    amount: b.total_amount,
    issueDate: b.issue_date,
    status: b.status,
  }));

const STATUS_DOT: Record<string, string> = {
  resolved: "bg-emerald-500",
  flagged: "bg-rose-500",
  in_review: "bg-amber-500",
  pending: "bg-amber-500",
  archived: "bg-muted-foreground",
};

// The step between the landing page's "Try the demo" and the real /dashboard: lets a visitor
// pick which of the mock dataset's bills to load, defaulting to all of them selected, rather
// than dropping them straight into a full 40-bill account they didn't choose. Public, outside
// app/dashboard's auth-gated layout - the session token isn't set until "Start demo" is
// clicked below.
export default function DemoSetupPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(PICKER_BILLS.map((b) => b.id)),
  );

  const allSelected = selected.size === PICKER_BILLS.length;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(
      allSelected ? new Set() : new Set(PICKER_BILLS.map((b) => b.id)),
    );
  }

  function startDemo() {
    resetDemoStore(Array.from(selected));
    setToken(DEMO_TOKEN);
    router.push("/dashboard");
  }

  return (
    <div className="relative flex min-h-screen w-full flex-col items-center overflow-hidden px-6 py-12 sm:px-8 sm:py-16 md:px-12 md:py-20 xl:px-24 xl:py-24">
      {/* Same two background images + gradient as the landing page (app/page.tsx) - this
          page is reached straight from there, so it should read as a continuation of it, not
          a different app. */}
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

      <div className="relative z-10 flex w-full max-w-3xl flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 duration-500 md:gap-8 xl:max-w-4xl">
        <div className="flex flex-col items-center text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-xs font-semibold tracking-wide text-primary uppercase md:gap-2 md:px-4 md:py-1.5 md:text-xs xl:px-5 xl:py-2 xl:text-sm">
            <span className="size-1 rounded-full bg-primary md:size-2 xl:size-2.5" />
            Demo setup
          </span>
          {/* Same heading/paragraph scale as the landing hero (app/page.tsx's h1/description
              paragraph) - matching margin-top and font-size steps across sm/md/xl. */}
          <h1 className="mt-8 text-2xl font-extrabold tracking-tight text-foreground sm:text-6xl md:mt-8 md:text-6xl xl:mt-10 xl:text-7xl">
            Choose the bills for your demo
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground md:mt-1 md:max-w-lg md:text-base xl:mt-10 xl:max-w-xl xl:text-lg">
            Every dashboard page will reflect only the bills you pick below -
            vendors, categories, and questions with nothing selected won&apos;t
            show up either.
          </p>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/80 shadow-xl backdrop-blur-md">
          <div className="flex items-center justify-between border-b border-border/60 bg-muted/30 px-4 py-3 sm:px-6">
            <label className="flex items-center gap-2 text-sm font-medium text-foreground">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                className="size-3 accent-primary"
              />
              Select all
            </label>
            <span className="rounded-full border border-primary/25 bg-primary/5 px-2.5 py-0.5 text-xs font-semibold text-primary">
              {selected.size} of {PICKER_BILLS.length} selected
            </span>
          </div>

          <div className="max-h-[26rem] overflow-y-auto">
            {PICKER_BILLS.map((bill) => (
              <label
                key={bill.id}
                className="flex cursor-pointer items-center gap-1 border-b border-border/40 px-4 py-2.5 text-sm transition-colors last:border-b-0 hover:bg-primary/5 sm:px-6"
              >
                <input
                  type="checkbox"
                  checked={selected.has(bill.id)}
                  onChange={() => toggle(bill.id)}
                  className="size-4 shrink-0 accent-primary"
                />
                <span
                  aria-hidden
                  className={`size-1.5 shrink-0 rounded-full ${STATUS_DOT[bill.status] ?? "bg-muted-foreground"}`}
                />
                <span className="min-w-0 flex-1 truncate font-medium text-foreground text-[12px]">
                  {bill.name}
                </span>
                <span className="hidden shrink-0 text-muted-foreground sm:block text-[12px]">
                  {bill.vendorName}
                </span>
                <span className="w-20 shrink-0 text-right text-muted-foreground text-[12px]">
                  {bill.issueDate ?? "—"}
                </span>
                <span className="w-20 shrink-0 text-right font-semibold text-foreground text-[12px]">
                  {bill.amount == null
                    ? "—"
                    : formatCurrency(bill.amount, { precise: true })}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            Back to landing page
          </Link>
          <Button
            type="button"
            disabled={selected.size === 0}
            onClick={startDemo}
            className="h-11 gap-2 px-6 text-sm shadow-lg shadow-primary/20 md:h-12 md:px-8 xl:h-14 xl:text-base"
          >
            <PlayCircle className="size-4 xl:size-5" />
            Start demo with {selected.size}{" "}
            {selected.size === 1 ? "bill" : "bills"}
          </Button>
        </div>
      </div>
    </div>
  );
}
