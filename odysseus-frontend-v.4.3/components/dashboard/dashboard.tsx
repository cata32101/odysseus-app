"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/hooks/use-auth"
import { Sidebar } from "./sidebar"
import { Header } from "./header"
import { CompaniesView } from "../companies/companies-view"
import { ContactsView } from "../contacts/contacts-view"
import { CampaignsView } from "../campaigns/campaigns-view"
import type { Company, Contact, Status } from "@/lib/types"
import { apiClient } from "@/lib/api"
import { createClient } from "@/lib/supabase"
import { useToast } from "@/hooks/use-toast"

export type DashboardView = "companies" | "contacts" | "campaigns"

// Define the filter interface and default values here
interface CompanyFilters {
  search: string;
  status: Status[];
  group: string[];
  scoreRanges: {
    unified: [number, number];
    geography: [number, number];
    industry: [number, number];
    russia: [number, number];
    size: [number, number];
  };
}

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
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const { user } = useAuth()
  const { toast } = useToast()
  const supabase = createClient()

  // Effect for loading data when filters, page, or user changes
  useEffect(() => {
    if (!user) return;

    const loadData = async () => {
      setLoading(true);
      try {
        // Fetch contacts and companies in parallel
        const [companyResponse, contactsData] = await Promise.all([
          apiClient.getCompanies(currentPage, itemsPerPage, filters),
          apiClient.getContacts()
        ]);

        setCompanies(companyResponse.data);
        setTotalCompanies(companyResponse.count);
        setContacts(contactsData);
      } catch (error) {
        console.error("Failed to load data:", error);
        toast({
          title: "Error",
          description: "Failed to load data. Please refresh the page.",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [user, currentPage, itemsPerPage, filters, toast]);

  // Effect for real-time subscriptions
  useEffect(() => {
    if (!user) return;

    const refreshData = async () => {
        console.log("Change detected, refetching current view...");
        try {
            const { data, count } = await apiClient.getCompanies(currentPage, itemsPerPage, filters);
            setCompanies(data);
            setTotalCompanies(count);
            
            const updatedContacts = await apiClient.getContacts();
            setContacts(updatedContacts);

        } catch (error) {
            console.error("Failed to refresh data on real-time update:", error);
        }
    }

    const companiesSubscription = supabase
      .channel("companies-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "companies" }, refreshData)
      .subscribe();

    const contactsSubscription = supabase
      .channel("contacts-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "contacts" }, refreshData)
      .subscribe();

    return () => {
      companiesSubscription.unsubscribe();
      contactsSubscription.unsubscribe();
    };
  }, [user, supabase, currentPage, itemsPerPage, filters]);

  const refreshData = async () => {
      setLoading(true);
      try {
        const [{ data: companiesData, count: companiesCount }, contactsData] = await Promise.all([
          apiClient.getCompanies(currentPage, itemsPerPage, filters),
          apiClient.getContacts()
        ]);
        setCompanies(companiesData);
        setTotalCompanies(companiesCount);
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
