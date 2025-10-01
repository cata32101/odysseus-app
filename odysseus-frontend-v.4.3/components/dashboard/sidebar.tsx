"use client"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Building2, Users, Mail, BarChart3 } from "lucide-react"
import type { DashboardView } from "./dashboard"

interface SidebarProps {
  activeView: DashboardView
  onViewChange: (view: DashboardView) => void
}

const navigationItems = [
  {
    id: "companies" as DashboardView,
    label: "Companies",
    icon: Building2,
    description: "Manage and vet companies",
  },
  {
    id: "contacts" as DashboardView,
    label: "Contacts",
    icon: Users,
    description: "People and relationships",
  },
  {
    id: "campaigns" as DashboardView,
    label: "Campaigns",
    icon: Mail,
    description: "Outreach campaigns",
  },
]

export function Sidebar({ activeView, onViewChange }: SidebarProps) {
  return (
    <div className="w-64 bg-card border-r border-border flex flex-col">
      <div className="p-6 border-b border-border">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-xl font-bold text-primary">Odysseus</h1>
            <p className="text-sm text-muted-foreground">Intelligence Platform</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-4">
        <div className="space-y-2">
          {navigationItems.map((item) => {
            const Icon = item.icon
            const isActive = activeView === item.id

            return (
              <Button
                key={item.id}
                variant={isActive ? "secondary" : "ghost"}
                className={cn(
                  "w-full justify-start gap-3 h-auto p-3",
                  isActive && "bg-secondary text-secondary-foreground",
                )}
                onClick={() => onViewChange(item.id)}
              >
                <Icon className="h-5 w-5" />
                <div className="text-left">
                  <div className="font-medium">{item.label}</div>
                  <div className="text-xs text-muted-foreground">{item.description}</div>
                </div>
              </Button>
            )
          })}
        </div>
      </nav>

      <div className="p-4 border-t border-border">
        <div className="text-xs text-muted-foreground">Ukrainian Oil & Gas Intelligence</div>
      </div>
    </div>
  )
}
