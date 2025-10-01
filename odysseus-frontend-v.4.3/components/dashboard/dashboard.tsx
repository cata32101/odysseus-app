"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/hooks/use-auth"
import { Sidebar } from "./sidebar"
import { Header } from "./header"
import { CompaniesView } from "../companies/companies-view"
import { ContactsView } from "../contacts/contacts-view"
import { CampaignsView } from "../campaigns/campaigns-view"
import type { Company, Contact } from "@/lib/types"
import { apiClient } from "@/lib/api"
import { createClient } from "@/lib/supabase"
import { useToast } from "@/hooks/use-toast"

export type DashboardView = "companies" | "contacts" | "campaigns"

export function Dashboard() {
  const [activeView, setActiveView] = useState<DashboardView>("companies")
  const [companies, setCompanies] = useState<Company[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const { user } = useAuth()
  const { toast } = useToast()
  const supabase = createClient()

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      try {
        const [companiesData, contactsData] = await Promise.all([apiClient.getCompanies(), apiClient.getContacts()])
        setCompanies(companiesData)
        setContacts(contactsData)
      } catch (error) {
        console.error("Failed to load data:", error)
        toast({
          title: "Error",
          description: "Failed to load data. Please refresh the page.",
          variant: "destructive",
        })
      } finally {
        setLoading(false)
      }
    }

    if (user) {
      loadData()
    }
  }, [user, toast])

  // Set up real-time subscriptions
  useEffect(() => {
    if (!user) return

    const companiesSubscription = supabase
      .channel("companies-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "companies",
        },
        async (payload) => {
          console.log("Companies change detected:", payload)
          try {
            const updatedCompanies = await apiClient.getCompanies()
            setCompanies(updatedCompanies)
          } catch (error) {
            console.error("Failed to refresh companies:", error)
          }
        },
      )
      .subscribe()

    const contactsSubscription = supabase
      .channel("contacts-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "contacts",
        },
        async (payload) => {
          console.log("Contacts change detected:", payload)
          try {
            const updatedContacts = await apiClient.getContacts()
            setContacts(updatedContacts)
          } catch (error) {
            console.error("Failed to refresh contacts:", error)
          }
        },
      )
      .subscribe()

    return () => {
      companiesSubscription.unsubscribe()
      contactsSubscription.unsubscribe()
    }
  }, [user, supabase])

  const refreshData = async () => {
    try {
      const [companiesData, contactsData] = await Promise.all([apiClient.getCompanies(), apiClient.getContacts()])
      setCompanies(companiesData)
      setContacts(contactsData)
    } catch (error) {
      console.error("Failed to refresh data:", error)
      toast({
        title: "Error",
        description: "Failed to refresh data.",
        variant: "destructive",
      })
    }
  }

  const renderActiveView = () => {
    switch (activeView) {
      case "companies":
        return <CompaniesView companies={companies} loading={loading} onRefresh={refreshData} />
      case "contacts":
        return <ContactsView contacts={contacts} companies={companies} loading={loading} onRefresh={refreshData} />
      case "campaigns":
        return <CampaignsView contacts={contacts} loading={loading} onRefresh={refreshData} />
      default:
        return null
    }
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar activeView={activeView} onViewChange={setActiveView} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header activeView={activeView} onRefresh={refreshData} />
        <main className="flex-1 overflow-y-auto">{renderActiveView()}</main>
      </div>
    </div>
  )
}