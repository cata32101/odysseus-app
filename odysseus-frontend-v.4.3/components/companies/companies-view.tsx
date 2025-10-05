"use client"

import { useState, useMemo, useCallback, useRef } from "react"
import type { Company, CompanyFilters, Status } from "@/lib/types"
import { CompanyTable } from "./company-table"
import { CompanyFiltersComponent } from "./company-filters"
import { AddCompaniesDialog } from "./add-companies-dialog"
import { CompanyDetailModal } from "./company-detail-modal"
import { VettingWorkflow } from "./vetting-workflow"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Plus, TrendingUp, Users, Clock } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { apiClient } from "@/lib/api"

interface CompaniesViewProps {
  companies: Company[];
  loading: boolean;
  onRefresh: () => void;
  totalCompanies: number;
  currentPage: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  onItemsPerPageChange: (limit: number) => void;
  filters: CompanyFilters;
  onFiltersChange: (filters: CompanyFilters) => void;
  sortBy: string;
  sortDir: string;
  onSortChange: (field: any) => void;
}

export function CompaniesView({
  companies,
  loading,
  onRefresh,
  totalCompanies,
  currentPage,
  itemsPerPage,
  onPageChange,
  onItemsPerPageChange,
  filters,
  onFiltersChange,
  sortBy,
  sortDir,
  onSortChange,
}: CompaniesViewProps) {
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [selectedCompanies, setSelectedCompanies] = useState<number[]>([])
  const { toast } = useToast()

  const statistics = useMemo(() => {
    return {
      total: totalCompanies,
      new: companies.filter((c) => c.status === "New").length,
      vetting: companies.filter((c) => c.status === "Vetting").length,
      approved: companies.filter((c) => c.status === "Approved").length,
      vetted: companies.filter((c) => c.status === "Vetted").length,
    }
  }, [companies, totalCompanies])

  const handleVetCompanies = async (companyIds: number[]) => {
    try {
      await apiClient.vetCompanies(companyIds)
      toast({
        title: "Vetting Started",
        description: `Started vetting process for ${companyIds.length} companies.`,
      })
      onRefresh()
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to start vetting process.",
        variant: "destructive",
      })
    }
  }

  const handleApproveCompany = async (companyId: number) => {
    try {
      await apiClient.approveCompany(companyId)
      toast({
        title: "Company Approved",
        description: "Company approved and contacts are being sourced.",
      })
      setSelectedCompany(null)
      onRefresh()
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to approve company.",
        variant: "destructive",
      })
    }
  }

  const handleRejectCompany = async (companyId: number) => {
    try {
      await apiClient.rejectCompany(companyId)
      toast({
        title: "Company Rejected",
        description: "Company has been rejected.",
      })
      setSelectedCompany(null)
      onRefresh()
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to reject company.",
        variant: "destructive",
      })
    }
  }

  const vettingCompanies = companies.filter((c) => c.status === "Vetting")
  const newCompanies = companies.filter((c) => c.status === "New")

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-2xl font-bold">Company Intelligence</h3>
          <p className="text-muted-foreground">
            Showing {companies.length} of {totalCompanies} companies
          </p>
        </div>
        <Button onClick={() => setShowAddDialog(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Add Companies
        </Button>
      </div>

      <VettingWorkflow
        vettingCompanies={vettingCompanies}
        newCompanies={newCompanies}
        onVetCompanies={handleVetCompanies}
      />

      <CompanyFiltersComponent
        filters={filters}
        onFiltersChange={onFiltersChange}
        companies={companies}
      />

      <CompanyTable
        companies={companies}
        loading={loading}
        selectedCompanies={selectedCompanies}
        onSelectedCompaniesChange={setSelectedCompanies}
        onCompanyClick={setSelectedCompany}
        onRefresh={onRefresh}
        currentPage={currentPage}
        totalPages={Math.ceil(totalCompanies / itemsPerPage)}
        onPageChange={onPageChange}
        itemsPerPage={itemsPerPage}
        onItemsPerPageChange={onItemsPerPageChange}
        totalResults={totalCompanies}
        sortBy={sortBy}
        sortDir={sortDir}
        onSortChange={onSortChange}
      />

      <AddCompaniesDialog open={showAddDialog} onOpenChange={setShowAddDialog} onSuccess={onRefresh} />

      {selectedCompany && (
        <CompanyDetailModal
          company={selectedCompany}
          open={!!selectedCompany}
          onOpenChange={(open) => !open && setSelectedCompany(null)}
          onApprove={() => handleApproveCompany(selectedCompany.id)}
          onReject={() => handleRejectCompany(selectedCompany.id)}
        />
      )}
    </div>
  )
}