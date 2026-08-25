"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ApiError, getCurrentUser, type UserRead } from "@/lib/api";
import { clearToken, getToken } from "@/lib/auth";

export default function DashboardPage() {
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
    <div className="flex min-h-screen w-full items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-4 p-6 text-center">
          <h1 className="text-xl font-semibold">Welcome, {user.username}</h1>
          <p className="text-sm text-muted-foreground">{user.email}</p>
          <Button variant="outline" onClick={handleLogout}>
            Log out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
