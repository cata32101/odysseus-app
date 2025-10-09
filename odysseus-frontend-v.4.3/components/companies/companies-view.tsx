"use client"

import { useState, useMemo } from "react"
import type { Company, CompanyFilters } from "@/lib/types"
import { CompanyTable } from "@/components/companies/company-table"
import { CompanyFiltersComponent } from "@/components/companies/company-filters"
import { AddCompaniesDialog } from "@/components/companies/add-companies-dialog"
import { CompanyDetailModal } from "@/components/companies/company-detail-modal"
import { VettingWorkflow } from "@/components/companies/vetting-workflow"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Plus, TrendingUp, Users, Clock, CheckCircle, XCircle, Trash2, RefreshCw, Pencil, Sparkles } from "lucide-react"
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
  const { toast } = useToast()

  const statistics = useMemo(() => {
    if (!allCompaniesForStats) return { total: 0, new: 0, vetting: 0, approved: 0, vetted: 0, weeklyGrowth: 0 };
    
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const companiesThisWeek = allCompaniesForStats.filter((c: Company) => 
      c.created_at && new Date(c.created_at) >= oneWeekAgo
    ).length;
    
    const total = allCompaniesForStats.length;
    const previousTotal = total - companiesThisWeek;
    const weeklyGrowth = previousTotal > 0 ? (companiesThisWeek / previousTotal) * 100 : (total > 0 ? 100 : 0);

    return {
      total: total,
      new: allCompaniesForStats.filter((c) => c.status === "New").length,
      vetting: allCompaniesForStats.filter((c) => c.status === "Vetting").length,
      approved: allCompaniesForStats.filter((c) => c.status === "Approved").length,
      vetted: allCompaniesForStats.filter((c) => c.status === "Vetted").length,
      weeklyGrowth: isNaN(weeklyGrowth) ? 0 : weeklyGrowth,
    };
  }, [allCompaniesForStats]);
    
  const { canApprove, canReject, canVet } = useMemo(() => {
    if (selectedCompanies.length === 0) {
      return { canApprove: false, canReject: false, canVet: false };
    }
    const selectedCompanyObjects = selectedCompanies
      .map(id => allCompaniesForStats.find(c => c.id === id))
      .filter((c): c is Company => !!c);

    return {
      canApprove: selectedCompanyObjects.some(c => c.status === 'Vetted'),
      canReject: selectedCompanyObjects.some(c => ['Vetted', 'New'].includes(c.status)),
      canVet: selectedCompanyObjects.some(c => ['New', 'Failed'].includes(c.status)),
    };
  }, [selectedCompanies, allCompaniesForStats]);

  const handleVetCompanies = async (companyIds: number[]) => {
    if (companyIds.length === 0) {
        toast({ title: "No New Companies to Vet", variant: "destructive" });
        return;
    }
    try {
      await apiClient.vetCompanies(companyIds);
      toast({ title: "Vetting Started", description: `Started vetting for ${companyIds.length} companies.` });
      onRefresh();
    } catch (error) {
      toast({ title: "Error", description: "Failed to start vetting process.", variant: "destructive" });
    }
  };
  
  const handleRetryFailed = async () => {
    try {
      const result = await apiClient.retryFailedCompanies();
      toast({ title: "Retrying Failed Companies", description: result.message });
      onRefresh();
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Could not start the retry process.", variant: "destructive" });
    }
  };

  const handleVetSelected = async () => {
    const idsToVet = selectedCompanies.filter(id => {
      const company = allCompaniesForStats.find(c => c.id === id);
      return company && ['New', 'Failed'].includes(company.status);
    });

    if (idsToVet.length > 0) {
      await handleVetCompanies(idsToVet);
      setSelectedCompanies([]);
    } else {
      toast({ title: "No Actionable Companies", description: "Select 'New' or 'Failed' companies to vet.", variant: "destructive" });
    }
  };

  const handleChangeGroupSelected = async () => {
      const newGroupName = prompt("Enter the new group name for the selected companies:", "");
      if (newGroupName === null) return;

      try {
          await apiClient.changeCompanyGroup(selectedCompanies, newGroupName);
          toast({ title: "Group Changed", description: `Moved ${selectedCompanies.length} companies to '${newGroupName}'.` });
          setSelectedCompanies([]);
          onRefresh();
      } catch (error) {
          toast({ title: "Error", description: "Failed to change group.", variant: "destructive" });
      }
  };
  
  const handleApproveRejectSelected = async (action: 'approve' | 'reject') => {
    const processableIds = selectedCompanies.filter(id => {
        const company = allCompaniesForStats.find(c => c.id === id);
        if (!company) return false;
        if (action === 'approve') return company.status === 'Vetted';
        if (action === 'reject') return ['Vetted', 'New'].includes(company.status);
        return false;
    });

    if (processableIds.length === 0) {
        toast({ title: "No Actionable Companies Selected", description: `Please select companies with the appropriate status to ${action}.`, variant: "destructive" });
        return;
    }

    try {
        if (action === 'approve') await apiClient.approveCompanies(processableIds);
        else await apiClient.rejectCompanies(processableIds);
        toast({ title: `Companies ${action}d`, description: `Successfully processed ${processableIds.length} companies.` });
        setSelectedCompanies([]);
        onRefresh();
    } catch (error) {
        toast({ title: "Error", description: `Failed to ${action} companies.`, variant: "destructive" });
    }
  };
  
  const handleDeleteSelected = async () => {
    if (selectedCompanies.length === 0) return;
    try {
      await apiClient.deleteCompanies(selectedCompanies);
      toast({ title: "Companies Deleted", description: `Deleted ${selectedCompanies.length} companies.` });
      setSelectedCompanies([]);
      onRefresh();
    } catch (error) {
      toast({ title: "Error", description: "Failed to delete companies.", variant: "destructive" });
    }
  };

  const vettingCompanies = allCompaniesForStats.filter((c) => c.status === "Vetting");
  const newCompanies = allCompaniesForStats.filter((c) => c.status === "New");

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-2xl font-bold">Company Intelligence</h3>
          <p className="text-muted-foreground">Showing {companies.length} of {totalCompanies} companies</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={handleRetryFailed} variant="outline" className="gap-2"><RefreshCw className="h-4 w-4" />Retry All Failed</Button>
          <Button onClick={() => setShowAddDialog(true)} className="gap-2"><Plus className="h-4 w-4" />Add Companies</Button>
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
              {statistics.weeklyGrowth > 0 && (
                   <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                      <TrendingUp className="h-4 w-4 text-emerald-500" />
                      +{statistics.weeklyGrowth.toFixed(1)}% this week
                  </p>
              )}
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
                onVetCompanies={() => handleVetCompanies(newCompanies.map(c => c.id))}
            />
        </div>
      </div>

      <div>
        {selectedCompanies.length > 0 ? (
          <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg justify-between">
            <span className="text-sm font-medium">{selectedCompanies.length} selected</span>
            <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleVetSelected} className="gap-2" disabled={!canVet}><Sparkles className="h-4 w-4"/> Vet</Button>
                <Button variant="outline" size="sm" onClick={handleChangeGroupSelected} className="gap-2"><Pencil className="h-4 w-4"/> Change Group</Button>
                <Button variant="outline" size="sm" onClick={() => handleApproveRejectSelected('approve')} className="gap-2" disabled={!canApprove}><CheckCircle className="h-4 w-4"/> Approve</Button>
                <Button variant="outline" size="sm" onClick={() => handleApproveRejectSelected('reject')} className="gap-2" disabled={!canReject}><XCircle className="h-4 w-4"/> Reject</Button>
                <Button variant="destructive" size="sm" onClick={handleDeleteSelected} className="gap-2"><Trash2 className="h-4 w-4"/> Delete</Button>
            </div>
          </div>
        ) : (
          <CompanyFiltersComponent filters={filters} onFiltersChange={onFiltersChange} allCompanies={allCompaniesForStats}/>
        )}
      </div>

      <div>
        <CompanyTable companies={companies} loading={loading} selectedCompanies={selectedCompanies} onSelectedCompaniesChange={setSelectedCompanies} onCompanyClick={setSelectedCompany} onRefresh={onRefresh} currentPage={currentPage} totalPages={Math.ceil(totalCompanies / itemsPerPage)} onPageChange={onPageChange} itemsPerPage={itemsPerPage} onItemsPerPageChange={onItemsPerPageChange} totalResults={totalCompanies} sortBy={sortBy} sortDir={sortDir} onSortChange={onSortChange} />
      </div>

      <AddCompaniesDialog open={showAddDialog} onOpenChange={setShowAddDialog} onSuccess={onRefresh} />
      {selectedCompany && (<CompanyDetailModal company={selectedCompany} open={!!selectedCompany} onOpenChange={(open) => !open && setSelectedCompany(null)} onApprove={async () => { if (selectedCompany) { await apiClient.approveCompany(selectedCompany.id); onRefresh(); setSelectedCompany(null); } }} onReject={async () => { if (selectedCompany) { await apiClient.rejectCompany(selectedCompany.id); onRefresh(); setSelectedCompany(null); } }} />)}
    </div>
  );
}