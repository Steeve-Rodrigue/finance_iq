"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Mail, User } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { IconInput } from "@/components/auth/icon-input";
import { PasswordInput } from "@/components/auth/password-input";
import { ApiError, login, signup } from "@/lib/api";
import { setToken } from "@/lib/auth";
import { signupSchema, type SignupValues } from "@/lib/validation";

export function SignupForm({
  onSwitchToLogin,
}: {
  onSwitchToLogin: () => void;
}) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupValues>({ resolver: zodResolver(signupSchema) });

  async function onSubmit(values: SignupValues) {
    try {
      await signup(values.email, values.username, values.password);
      // Signup doesn't return a token, so log in right after to keep this a one-step flow.
      const { access_token } = await login(values.email, values.password);
      setToken(access_token);
      router.push("/dashboard");
    } catch (error) {
      const message =
        error instanceof ApiError
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
          <FieldLabel htmlFor="signup-email">Email</FieldLabel>
          <IconInput
            id="signup-email"
            icon={Mail}
            type="email"
            placeholder="you@example.com"
            aria-invalid={!!errors.email}
            {...register("email")}
          />
          <FieldError errors={[errors.email]} />
        </Field>

        <Field data-invalid={!!errors.username}>
          <FieldLabel htmlFor="signup-username">Username</FieldLabel>
          <IconInput
            id="signup-username"
            icon={User}
            placeholder="janedoe"
            aria-invalid={!!errors.username}
            {...register("username")}
          />
          {errors.username ? (
            <FieldError errors={[errors.username]} />
          ) : (
            <FieldDescription>3-50 characters</FieldDescription>
          )}
        </Field>

        <Field data-invalid={!!errors.password}>
          <FieldLabel htmlFor="signup-password">Password</FieldLabel>
          <PasswordInput
            id="signup-password"
            placeholder="At least 8 characters"
            aria-invalid={!!errors.password}
            {...register("password")}
          />
          <FieldError errors={[errors.password]} />
        </Field>
      </FieldGroup>

      <Button type="submit" disabled={isSubmitting} className="h-10 w-full">
        {isSubmitting ? "Creating account…" : "Create account"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <button
          type="button"
          onClick={onSwitchToLogin}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Sign in
        </button>
      </p>
    </form>
  );
}
