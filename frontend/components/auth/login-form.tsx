"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Mail } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { IconInput } from "@/components/auth/icon-input";
import { PasswordInput } from "@/components/auth/password-input";
import { ApiError, login } from "@/lib/api";
import { setToken } from "@/lib/auth";
import { loginSchema, type LoginValues } from "@/lib/validation";

export function LoginForm({
  onSwitchToSignup,
}: {
  onSwitchToSignup: () => void;
}) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(values: LoginValues) {
    try {
      const { access_token } = await login(values.email, values.password);
      setToken(access_token);
      router.push("/dashboard");
    } catch (error) {
      const message =
        error instanceof ApiError && error.status === 401
          ? "Incorrect email or password"
          : error instanceof ApiError
            ? error.message
            : "Couldn't reach the server. Please try again.";
      toast.error(message);
    }
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 duration-500 sm:gap-6"
    >
      <FieldGroup className="gap-4 sm:gap-5">
        <Field data-invalid={!!errors.email}>
          <FieldLabel htmlFor="login-email">Email</FieldLabel>
          <IconInput
            id="login-email"
            icon={Mail}
            type="email"
            placeholder="you@example.com"
            aria-invalid={!!errors.email}
            {...register("email")}
          />
          <FieldError errors={[errors.email]} />
        </Field>

        <Field data-invalid={!!errors.password}>
          <FieldLabel htmlFor="login-password">Password</FieldLabel>
          <PasswordInput
            id="login-password"
            placeholder="Enter your password"
            aria-invalid={!!errors.password}
            {...register("password")}
          />
          <FieldError errors={[errors.password]} />
        </Field>
      </FieldGroup>

      <Button type="submit" disabled={isSubmitting} className="h-10 w-full">
        {isSubmitting ? "Signing in…" : "Sign in"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <button
          type="button"
          onClick={onSwitchToSignup}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Create one
        </button>
      </p>
    </form>
  );
}
