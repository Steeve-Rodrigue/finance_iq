import { z } from "zod";

// Mirrors backend/app/schemas/auth.py::LoginRequest.
export const loginSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export type LoginValues = z.infer<typeof loginSchema>;

// Mirrors backend/app/schemas/users.py::UserCreate.
export const signupSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  username: z
    .string()
    .min(3, "At least 3 characters")
    .max(50, "At most 50 characters"),
  password: z
    .string()
    .min(8, "At least 8 characters")
    .max(72, "At most 72 characters"),
});

export type SignupValues = z.infer<typeof signupSchema>;
