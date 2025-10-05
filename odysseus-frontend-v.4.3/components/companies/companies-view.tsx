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
import { Plus, TrendingUp, Users, Clock, CheckCircle } from "lucide-react" // FIX: Import CheckCircle
import { useToast } from "@/hooks/use-toast"
import { apiClient } from "@/lib/api"

interface CompaniesViewProps {
  allCompaniesForStats: Company[];
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
  allCompaniesForStats,
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
  const tableRef = useRef<HTMLDivElement>(null)
  const { toast } = useToast()

  const statistics = useMemo(() => {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const companiesThisWeek = allCompaniesForStats.filter((c: Company) => {
      if (!c.created_at) return false;
      try {
        const createdDate = new Date(c.created_at);
        return createdDate >= oneWeekAgo;
      } catch {
        return false;
      }
    }).length;
    
    const total = allCompaniesForStats.length;
    const weeklyGrowth = total > 0 && (total - companiesThisWeek > 0) ? (companiesThisWeek / (total - companiesThisWeek)) * 100 : 0;

    return {
      total: total,
      new: allCompaniesForStats.filter((c) => c.status === "New").length,
      vetting: allCompaniesForStats.filter((c) => c.status === "Vetting").length,
      approved: allCompaniesForStats.filter((c) => c.status === "Approved").length,
      vetted: allCompaniesForStats.filter((c) => c.status === "Vetted").length,
      weeklyGrowth: isNaN(weeklyGrowth) ? 0 : weeklyGrowth,
      companiesThisWeek,
    };
  }, [allCompaniesForStats]);

  const handleVetCompanies = async (companyIds: number[]) => {
    try {
      await apiClient.vetCompanies(companyIds);
      toast({
        title: "Vetting Started",
        description: `Started vetting process for ${companyIds.length} companies.`,
      });
      onRefresh();
    } catch (error) {
      console.error("Failed to vet companies:", error);
      toast({
        title: "Error",
        description: "Failed to start vetting process.",
        variant: "destructive",
      });
    }
  };

  const handleVetAllNew = async () => {
    const newCompanyIds = allCompaniesForStats.filter((c) => c.status === "New").map((c) => c.id)
    if (newCompanyIds.length === 0) return

    try {
      await apiClient.vetCompanies(newCompanyIds)
      toast({
        title: "Vetting Started",
        description: `Started vetting process for ${newCompanyIds.length} new companies.`,
      })
      onRefresh()
    } catch (error) {
      console.error("Failed to vet all new companies:", error)
      toast({
        title: "Error",
        description: "Failed to start vetting process for new companies.",
        variant: "destructive",
      })
    }
  }

  const handleApproveCompany = async (companyId: number) => {
    try {
      await apiClient.approveCompany(companyId);
      toast({
        title: "Company Approved",
        description: "Company approved and contacts are being sourced.",
      });
      setSelectedCompany(null);
      onRefresh();
    } catch (error) {
      console.error("Failed to approve company:", error);
      toast({
        title: "Error",
        description: "Failed to approve company.",
        variant: "destructive",
      });
    }
  };

  const handleRejectCompany = async (companyId: number) => {
    try {
      await apiClient.rejectCompany(companyId);
      toast({
        title: "Company Rejected",
        description: "Company has been rejected.",
      });
      setSelectedCompany(null);
      onRefresh();
    } catch (error) {
      console.error("Failed to reject company:", error);
      toast({
        title: "Error",
        description: "Failed to reject company.",
        variant: "destructive",
      });
    }
  };

  const vettingCompanies = allCompaniesForStats.filter((c) => c.status === "Vetting");
  const newCompanies = allCompaniesForStats.filter((c) => c.status === "New");

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
          {statistics.new > 0 && (
            <Button onClick={handleVetAllNew} variant="outline" className="gap-2 bg-transparent">
              Vet All New ({statistics.new})
            </Button>
          )}
          <Button onClick={() => setShowAddDialog(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Companies
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-3xl font-bold">{statistics.total}</div>
                  <div className="text-sm font-medium">Total Companies</div>
                </div>
                <Users className="h-10 w-10 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-3xl font-bold">{statistics.new + statistics.vetting}</div>
                  <div className="text-sm font-medium">Pending Review</div>
                </div>
                <Clock className="h-10 w-10 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-3xl font-bold">{statistics.approved}</div>
                  <div className="text-sm font-medium">Approved</div>
                </div>
                <CheckCircle className="h-10 w-10 text-green-500" />
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
        allCompanies={allCompaniesForStats}
      />

      <div ref={tableRef}>
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
          onItemsPerPageChange={onItemsPerPageChange} // FIX: Correct prop name
          totalResults={totalCompanies}
          sortBy={sortBy}
          sortDir={sortDir}
          onSortChange={onSortChange}
        />
      </div>

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
  );
}