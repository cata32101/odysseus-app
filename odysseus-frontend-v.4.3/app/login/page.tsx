"use client"

import { AuthProvider } from "@/hooks/use-auth"
import { LoginForm } from "@/components/auth/login-form"

export default function LoginPage() {
  return (
    <AuthProvider>
      <LoginForm />
    </AuthProvider>
  )
}