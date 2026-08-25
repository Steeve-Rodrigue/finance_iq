"use client";

import { Landmark, LogOut, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import type { UserRead } from "@/lib/api";
import { cn } from "@/lib/utils";
import { DASHBOARD_NAV_ITEMS } from "./nav-items";

const MIN_WIDTH = 200;
const MAX_WIDTH = 420;
const DEFAULT_WIDTH = 256; // matches the old fixed xl:w-64
const WIDTH_STORAGE_KEY = "financeiq_sidebar_width";
const COLLAPSED_STORAGE_KEY = "financeiq_sidebar_collapsed";

function clampWidth(value: number): number {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, value));
}

type DashboardSidebarProps = {
  user: UserRead;
  onLogout: () => void;
};

// frontend/CLAUDE.md's sidebar spec is nav-only ("no profile/settings") - the user has since
// asked for the account footer (email + logout) to live here instead of a separate header bar,
// so it does. Collapse to an icon bar/compact rail below xl stays a fixed breakpoint-driven
// width (not resizable - there's no label to make room for down there); the full (>=xl)
// sidebar's width is user-draggable and remembered in localStorage, same persistence
// convention as lib/auth.ts's token. The whole sidebar can also be hidden entirely via the
// toggle button, independent of that width - also remembered in localStorage.
export function DashboardSidebar({ user, onLogout }: DashboardSidebarProps) {
  const pathname = usePathname();
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const widthRef = useRef(DEFAULT_WIDTH);
  const draggingRef = useRef(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    // Reads external stores (localStorage) after mount to avoid an SSR/client mismatch -
    // can't be a lazy useState initializer since window isn't available server-side.
    const storedWidth = Number(window.localStorage.getItem(WIDTH_STORAGE_KEY));
    if (
      Number.isFinite(storedWidth) &&
      storedWidth >= MIN_WIDTH &&
      storedWidth <= MAX_WIDTH
    ) {
      widthRef.current = storedWidth;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setWidth(storedWidth);
    }
    if (window.localStorage.getItem(COLLAPSED_STORAGE_KEY) === "1") {
      setCollapsed(true);
    }
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(COLLAPSED_STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    draggingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    document.body.classList.add("select-none");
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    // The sidebar is pinned to the viewport's left edge, so clientX doubles as its width.
    const next = clampWidth(event.clientX);
    widthRef.current = next;
    setWidth(next);
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    event.currentTarget.releasePointerCapture(event.pointerId);
    document.body.classList.remove("select-none");
    window.localStorage.setItem(WIDTH_STORAGE_KEY, String(widthRef.current));
  }

  // Collapsed: no nav in the flex flow at all (main regains the space), just a small fixed
  // button floating over the page to bring it back.
  if (collapsed) {
    return (
      <button
        type="button"
        onClick={toggleCollapsed}
        title="Show sidebar"
        className="fixed top-4 left-3 z-40 flex size-9 items-center justify-center rounded-lg border border-border bg-card text-foreground shadow-sm transition-colors hover:bg-muted"
      >
        <PanelLeftOpen className="size-4" />
      </button>
    );
  }

  return (
    <nav
      aria-label="Dashboard"
      style={{ "--sidebar-width": `${width}px` } as React.CSSProperties}
      className="sticky top-0 flex h-screen w-14 shrink-0 flex-col gap-1 border-r border-sidebar-border bg-sidebar px-2 py-4 text-sidebar-foreground relative xl:w-(--sidebar-width) xl:px-3"
    >
      <Link
        href="/dashboard"
        title="FinanceIQ"
        className="mt-4 mb-4 flex shrink-0 flex-col items-center justify-center gap-1.5"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Landmark className="size-4" />
        </span>
        <span className="flex flex-col items-center text-center font-heading text-[10px] leading-tight font-semibold xl:hidden">
          <span>Finance</span>
          <span>IQ</span>
        </span>
        <span className="hidden truncate font-heading text-lg font-semibold xl:inline">
          FinanceIQ
        </span>
      </Link>

      <button
        type="button"
        onClick={toggleCollapsed}
        title="Hide sidebar"
        className="mb-4 flex h-8 shrink-0 items-center justify-center gap-2 rounded-lg text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground xl:justify-start xl:px-3"
      >
        <PanelLeftClose className="size-4 shrink-0" />
        <span className="hidden truncate text-sm xl:inline">Hide sidebar</span>
      </button>

      <ul className="flex flex-1 flex-col gap-1">
        {DASHBOARD_NAV_ITEMS.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                title={item.label}
                className={cn(
                  "flex h-9 items-center justify-center gap-3 rounded-lg px-2 text-sm font-bold transition-colors xl:justify-start xl:px-3",
                  active
                    ? "text-sidebar-primary-foreground xl:bg-sidebar-primary"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                {/* Below xl, the fill is a small chip around just the icon, not the full
                    row - a full-width fill at icon-only widths looked oversized. At xl the
                    row itself is filled instead (see the Link's own xl:bg-sidebar-primary
                    above) and this chip goes transparent. */}
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-lg xl:size-auto xl:rounded-none",
                    active && "bg-sidebar-primary xl:bg-transparent",
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                </span>
                <span className="hidden truncate xl:inline">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Account footer - email + logout, moved down here from the old separate header bar. */}
      <div className="mt-1 flex shrink-0 flex-col gap-1 border-t border-sidebar-border pt-3">
        <span
          title={user.email}
          className="hidden truncate px-3 text-xs text-sidebar-foreground/60 xl:block"
        >
          {user.email}
        </span>
        <button
          type="button"
          onClick={onLogout}
          title="Log out"
          className="flex h-9 items-center justify-center gap-3 rounded-lg px-2 text-sm font-bold text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground xl:justify-start xl:px-3"
        >
          <LogOut className="size-4 shrink-0" />
          <span className="hidden truncate xl:inline">Log out</span>
        </button>
      </div>

      {/* Drag handle - full-sidebar (>=xl) only, same reasoning as the width itself: there's
          nothing to resize down at the icon-bar/compact widths. */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="absolute inset-y-0 right-0 hidden w-1 -translate-x-1/2 cursor-col-resize touch-none xl:block"
      />
    </nav>
  );
}
