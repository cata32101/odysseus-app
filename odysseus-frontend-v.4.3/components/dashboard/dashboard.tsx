"use client"

import { useState, useEffect, useCallback } from "react"
import { useAuth } from "@/hooks/use-auth"
import { createClient } from "@/lib/supabase"
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
  const supabase = createClient()

  const isScoreFilterActive = useCallback(() => {
    const { scoreRanges } = filters;
    return (
      scoreRanges.unified[0] > 0 || scoreRanges.unified[1] < 10 ||
      scoreRanges.geography[0] > 0 || scoreRanges.geography[1] < 10 ||
      scoreRanges.industry[0] > 0 || scoreRanges.industry[1] < 10 ||
      scoreRanges.russia[0] > 0 || scoreRanges.russia[1] < 10 ||
      scoreRanges.size[0] > 0 || scoreRanges.size[1] < 10
    );
  }, [filters]);

  const refreshData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      let finalCompanies: Company[] = [];
      let finalCount = 0;

      // Use composite queries if a score filter is active
      if (isScoreFilterActive()) {
        const [scoredResponse, unscoredResponse] = await Promise.all([
          apiClient.getCompanies(currentPage, itemsPerPage, filters, sortBy, sortDir),
          apiClient.getCompanies(1, 1000, { ...filters, status: ['New', 'Failed'], scoreRanges: defaultFilters.scoreRanges }, 'created_at', 'desc')
        ]);
        
        const combined = [...scoredResponse.data, ...unscoredResponse.data];
        const uniqueCompanies = Array.from(new Map(combined.map(c => [c.id, c])).values());
        
        finalCompanies = uniqueCompanies;
        finalCount = scoredResponse.count + unscoredResponse.count; // This is an approximation
      } else {
        // Standard fetch if no score filters
        const companyResponse = await apiClient.getCompanies(currentPage, itemsPerPage, filters, sortBy, sortDir);
        finalCompanies = companyResponse.data;
        finalCount = companyResponse.count;
      }

      const [contactsData, allCompaniesResponse] = await Promise.all([
        apiClient.getContacts(),
        apiClient.getCompaniesForStats()
      ]);

      setCompanies(finalCompanies);
      setTotalCompanies(finalCount);
      setContacts(contactsData);
      setAllCompaniesForStats(allCompaniesResponse);
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
  }, [user, currentPage, itemsPerPage, filters, sortBy, sortDir, toast, isScoreFilterActive]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);
  
  // Real-time listener for live updates
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('realtime-companies')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'companies' }, (payload) => {
        console.log('Change received!', payload);
        toast({ title: "Data updated", description: "The company list has been updated in real-time." });
        refreshData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, user, refreshData, toast]);


  const handleSortChange = (field: string) => {
    if (sortBy === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortDir(field.includes('_score') ? 'desc' : 'asc');
    }
    setCurrentPage(1);
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

