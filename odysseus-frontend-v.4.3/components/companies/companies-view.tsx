"use client"

import { useState, useMemo } from "react"
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
    // Note: These stats are now just for the *visible* companies on the page.
    // For full-database stats, a separate API endpoint would be needed.
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
      console.error("Failed to vet companies:", error)
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
      console.error("Failed to approve company:", error)
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
      console.error("Failed to reject company:", error)
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
        <div className="flex items-center gap-2">
           <Button onClick={() => setShowAddDialog(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Companies
          </Button>
        </div>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-6">
           <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200 hover:shadow-md transition-shadow">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-3xl font-bold text-blue-700">{statistics.total}</div>
                  <div className="text-sm font-medium text-blue-600">Total Companies</div>
                </div>
                <Users className="h-10 w-10 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200 hover:shadow-md transition-shadow">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-3xl font-bold text-amber-700">{statistics.new + statistics.vetting}</div>
                  <div className="text-sm font-medium text-amber-600">Pending Review</div>
                </div>
                <Clock className="h-10 w-10 text-amber-500" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-200 hover:shadow-md transition-shadow">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-3xl font-bold text-emerald-700">{statistics.approved}</div>
                  <div className="text-sm font-medium text-emerald-600">Approved</div>
                </div>
                 <div className="h-10 w-10 rounded-full bg-emerald-500 flex items-center justify-center">
                  <div className="h-5 w-5 rounded-full bg-white"></div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        <div className="lg:col-span-1">
            <VettingWorkflow
                vettingCompanies={vettingCompanies}
                newCompanies={newCompanies}
                onVetCompanies={handleVetCompanies}
            />
        </div>
      </div>

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