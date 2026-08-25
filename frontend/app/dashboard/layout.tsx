"use client";

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

  if (!user) return null;

  return (
    <div className="flex min-h-screen w-full">
      <DashboardSidebar user={user} onLogout={handleLogout} />
      <main className="flex-1 p-4 md:p-6">{children}</main>
    </div>
  );
}
