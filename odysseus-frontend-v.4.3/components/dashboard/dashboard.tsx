"use client"

import { useState, useEffect, useCallback } from "react"
import { useAuth } from "@/hooks/use-auth"
import { Sidebar } from "./sidebar"
import { Header } from "./header"
import { CompaniesView } from "../companies/companies-view"
import { ContactsView } from "../contacts/contacts-view"
import { CampaignsView } from "../campaigns/campaigns-view"
import type { Company, Contact, CompanyFilters } from "@/lib/types"
import { apiClient } from "@/lib/api"
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
  const [allCompaniesForStats, setAllCompaniesForStats] = useState<Company[]>([]);
  const [activeView, setActiveView] = useState<DashboardView>("companies")
  const [companies, setCompanies] = useState<Company[]>([])
  const [totalCompanies, setTotalCompanies] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)
  const [filters, setFilters] = useState<CompanyFilters>(defaultFilters);
  const [sortBy, setSortBy] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const { user } = useAuth()
  const { toast } = useToast()

  const refreshData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [companyResponse, contactsData, allCompaniesResponse] = await Promise.all([
        apiClient.getCompanies(currentPage, itemsPerPage, filters, sortBy, sortDir),
        apiClient.getContacts(),
        apiClient.getCompanies(1, 10000, defaultFilters, 'created_at', 'desc') 
      ]);

      setCompanies(companyResponse.data);
      setTotalCompanies(companyResponse.count);
      setContacts(contactsData);
      setAllCompaniesForStats(allCompaniesResponse.data);
    } catch (error) {
      console.error("Failed to refresh data:", error)
      toast({
        title: "Error fetching data",
        description: "Could not load data from the server. Please check your connection and try again.",
        variant: "destructive",
      })
    } finally {
      setLoading(false);
    }
  }, [user, currentPage, itemsPerPage, filters, sortBy, sortDir, toast]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  const handleSortChange = (field: string) => {
    if (sortBy === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortDir(field.includes('_score') ? 'desc' : 'asc');
    }
    setCurrentPage(1); // Reset to first page on sort change
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
            allCompaniesForStats={allCompaniesForStats}
          />
        )
      case "contacts":
        // Pass the full list of companies to the contacts view for filtering context
        return <ContactsView contacts={contacts} companies={allCompaniesForStats} loading={loading} onRefresh={refreshData} />
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