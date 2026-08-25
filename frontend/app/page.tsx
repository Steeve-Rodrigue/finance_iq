"use client";

import { useState } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/login-form";
import { SignupForm } from "@/components/auth/signup-form";

export default function Home() {
  const [tab, setTab] = useState<"login" | "signup">("login");

  return (
    <AuthCard>
      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as "login" | "signup")}
      >
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="login">Sign in</TabsTrigger>
          <TabsTrigger value="signup">Create account</TabsTrigger>
        </TabsList>
        <TabsContent value="login" className="pt-4 sm:pt-6">
          <LoginForm onSwitchToSignup={() => setTab("signup")} />
        </TabsContent>
        <TabsContent value="signup" className="pt-4 sm:pt-6">
          <SignupForm onSwitchToLogin={() => setTab("login")} />
        </TabsContent>
      </Tabs>
    </AuthCard>
  );
}
