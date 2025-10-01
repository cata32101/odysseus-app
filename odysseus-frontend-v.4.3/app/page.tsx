"use client"

import { AuthProvider } from "@/hooks/use-auth"
import { AuthGuard } from "@/components/auth/auth-guard"
import { Dashboard } from "@/components/dashboard/dashboard"

export default function Home() {
  return (
    <AuthProvider>
      <AuthGuard>
        <Dashboard />
      </AuthGuard>
    </AuthProvider>
  )
}
