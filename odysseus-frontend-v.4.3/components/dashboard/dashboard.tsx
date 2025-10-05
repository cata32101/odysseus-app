"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/hooks/use-auth"
import { Sidebar } from "./sidebar"
import { Header } from "./header"
import { CompaniesView } from "../companies/companies-view"
import { ContactsView } from "../contacts/contacts-view"
import { CampaignsView } from "../campaigns/campaigns-view"
import type { Company, Contact, Status, CompanyFilters } from "@/lib/types"
import { apiClient } from "@/lib/api"
import { createClient } from "@/lib/supabase"
import { useToast } from "@/hooks/use-toast"

export type DashboardView = "companies" | "contacts" | "campaigns"

const defaultFilters: CompanyFilters = {
  search: "",
  status: [],
  group: [],
  scoreRanges: {
    unified: [0, 10],
    geography: [0, 10],
    industry: [0, 10],
    russia: [0, 10],
    size: [0, 10],
  },
};

export function Dashboard() {
  const [activeView, setActiveView] = useState<DashboardView>("companies")
  const [companies, setCompanies] = useState<Company[]>([])
  const [totalCompanies, setTotalCompanies] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)
  const [filters, setFilters] = useState<CompanyFilters>(defaultFilters);
  const [sortBy, setSortBy] = useState('created_at'); // Add sorting state
  const [sortDir, setSortDir] = useState('desc');     // Add sorting direction
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const { user } = useAuth()
  const { toast } = useToast()
  const supabase = createClient()

  const refreshData = async () => {
      setLoading(true);
      try {
        const [companyResponse, contactsData] = await Promise.all([
          apiClient.getCompanies(currentPage, itemsPerPage, filters, sortBy, sortDir),
          apiClient.getContacts()
        ]);
        setCompanies(companyResponse.data);
        setTotalCompanies(companyResponse.count);
        setContacts(contactsData);
      } catch (error) {
        console.error("Failed to refresh data:", error)
        toast({
          title: "Error",
          description: "Failed to refresh data.",
          variant: "destructive",
        })
      } finally {
        setLoading(false);
      }
  }

  // Effect for loading data when filters, page, or user changes
  useEffect(() => {
    if (!user) return;
    refreshData();
  }, [user, currentPage, itemsPerPage, filters, sortBy, sortDir]); // Add dependencies

  const handleSortChange = (field: string) => {
    if (sortBy === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      // Default to DESC for scores, and ASC for everything else
      if (field.includes('_score')) {
        setSortDir('desc');
      } else {
        setSortDir('asc');
      }
    }
  };
  
  const renderActiveView = () => {
    switch (activeView) {
      case "companies":
        return (
          <CompaniesView
            companies={companies}
            loading={loading}
            onRefresh={refreshData}
            totalCompanies={totalCompanies}
            currentPage={currentPage}
            itemsPerPage={itemsPerPage}
            onPageChange={setCurrentPage}
            onItemsPerPageChange={setItemsPerPage}
            filters={filters}
            onFiltersChange={setFilters}
            sortBy={sortBy}
            sortDir={sortDir}
            onSortChange={handleSortChange}
          />
        )
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