"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { ApiError, getCurrentUser, type UserRead } from "@/lib/api";
import { clearToken, getToken } from "@/lib/auth";

export default function DashboardLayout({
  children,
}: LayoutProps<"/dashboard">) {
  const router = useRouter();
  const [user, setUser] = useState<UserRead | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace("/");
      return;
    }

    getCurrentUser(token)
      .then(setUser)
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 401) {
          clearToken();
        }
        router.replace("/");
      });
  }, [router]);

  function handleLogout() {
    clearToken();
    router.replace("/");
  }

  if (!user) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-background">
        <Loader2
          className="size-8 animate-spin text-primary"
          role="status"
          aria-label="Loading"
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full">
      <DashboardSidebar user={user} onLogout={handleLogout} />
      <div className="relative flex-1 overflow-hidden">
        {/* Same soft-blob technique as the sign-in page (components/auth/auth-card.tsx),
            re-tinted gold. Absolute + a plain z-10 on `main` (no negative z-index) so it
            can't end up behind the sidebar or body background in some stacking edge case. */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -top-24 right-0 size-96 rounded-full bg-primary/10 blur-3xl dark:bg-primary/5" />
          <div className="absolute bottom-0 left-1/3 size-96 rounded-full bg-primary/5 blur-3xl dark:bg-primary/[0.03]" />
        </div>
        <main className="relative z-10 px-5 py-4 md:px-6 md:py-6 xl:px-30 xl:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
