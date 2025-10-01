"use client"

import { useState, useRef, useCallback, useMemo, useEffect } from "react"
import type { Company, Status } from "@/lib/types"
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
  companies: Company[]
  loading: boolean
  onRefresh: () => void
}

const defaultFilters = {
  search: "",
  status: [] as Status[],
  group: [] as string[],
  scoreRanges: {
    unified: [0, 10],
    geography: [0, 10],
    industry: [0, 10],
    russia: [0, 10],
    size: [0, 10],
  },
}

export function CompaniesView({ companies, loading, onRefresh }: CompaniesViewProps) {
  const [filters, setFilters] = useState(defaultFilters)
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [selectedCompanies, setSelectedCompanies] = useState<number[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null)
  const tableRef = useRef<HTMLDivElement>(null)
  const { toast } = useToast()

  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)

  const statistics = useMemo(() => {
    const stats = {
      total: companies.length,
      new: companies.filter((c) => c.status === "New").length,
      vetting: companies.filter((c) => c.status === "Vetting").length,
      vetted: companies.filter((c) => c.status === "Vetted").length,
      approved: companies.filter((c) => c.status === "Approved").length,
      rejected: companies.filter((c) => c.status === "Rejected").length,
      failed: companies.filter((c) => c.status === "Failed").length,
    }

    const oneWeekAgo = new Date()
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)

    const companiesThisWeek = companies.filter((c) => {
      if (!c.created_at) return false
      try {
        const createdDate = new Date(c.created_at)
        return createdDate >= oneWeekAgo
      } catch {
        return false
      }
    }).length

    const weeklyGrowth = stats.total > 0 ? (companiesThisWeek / (stats.total - companiesThisWeek)) * 100 : 0

    return { ...stats, weeklyGrowth: isNaN(weeklyGrowth) ? 0 : weeklyGrowth, companiesThisWeek }
  }, [companies])

  const filteredCompanies = useMemo(() => {
    return companies.filter((company) => {
      if (filters.search) {
        const searchLower = filters.search.toLowerCase()
        const matchesSearch =
          company.name?.toLowerCase().includes(searchLower) || company.domain.toLowerCase().includes(searchLower)
        if (!matchesSearch) return false
      }

      if (filters.status.length > 0 && !filters.status.includes(company.status)) {
        return false
      }

      if (filters.group.length > 0) {
        if (!company.group_name && !filters.group.includes("No Group")) {
          return false
        }
        if (company.group_name && !filters.group.includes(company.group_name)) {
          return false
        }
      }

      if (company.unified_score !== undefined) {
        const [min, max] = filters.scoreRanges.unified
        if (company.unified_score < min || company.unified_score > max) return false
      }

      if (company.geography_score !== undefined) {
        const [min, max] = filters.scoreRanges.geography
        if (company.geography_score < min || company.geography_score > max) return false
      }

      if (company.industry_score !== undefined) {
        const [min, max] = filters.scoreRanges.industry
        if (company.industry_score < min || company.industry_score > max) return false
      }

      if (company.russia_score !== undefined) {
        const [min, max] = filters.scoreRanges.russia
        if (company.russia_score < min || company.russia_score > max) return false
      }

      if (company.size_score !== undefined) {
        const [min, max] = filters.scoreRanges.size
        if (company.size_score < min || company.size_score > max) return false
      }

      return true
    })
  }, [companies, filters])

  const paginatedCompanies = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage
    return filteredCompanies.slice(startIndex, startIndex + itemsPerPage)
  }, [filteredCompanies, currentPage, itemsPerPage])

  const totalPages = Math.ceil(filteredCompanies.length / itemsPerPage)

  useEffect(() => {
    setCurrentPage(1)
  }, [filters, itemsPerPage])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.target instanceof HTMLElement && e.target.closest("[data-company-row]")) {
      setIsDragging(true)
      setDragStart({ x: e.clientX, y: e.clientY })
    }
  }, [])

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging || !dragStart) return

      const threshold = 5
      const distance = Math.sqrt(Math.pow(e.clientX - dragStart.x, 2) + Math.pow(e.clientY - dragStart.y, 2))

      if (distance > threshold) {
        const rows = document.querySelectorAll("[data-company-row]")
        const newSelected: number[] = []

        rows.forEach((row) => {
          const rect = row.getBoundingClientRect()
          const mouseY = e.clientY

          if (mouseY >= Math.min(dragStart.y, rect.top) && mouseY <= Math.max(dragStart.y, rect.bottom)) {
            const companyId = Number.parseInt(row.getAttribute("data-company-id") || "0")
            if (companyId) newSelected.push(companyId)
          }
        })

        if (JSON.stringify(newSelected) !== JSON.stringify(selectedCompanies)) {
          setSelectedCompanies(newSelected)
        }
      }
    },
    [isDragging, dragStart, selectedCompanies],
  )

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
    setDragStart(null)
  }, [])

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

  const handleVetAllNew = async () => {
    const newCompanyIds = companies.filter((c) => c.status === "New").map((c) => c.id)
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

  const vettingCompanies = companies.filter((c) => c.status === "Vetting")
  const newCompanies = companies.filter((c) => c.status === "New")

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div className="space-y-4">
          <div>
            <h3 className="text-2xl font-bold">Company Intelligence</h3>
            <p className="text-muted-foreground">
              Showing {paginatedCompanies.length} of {filteredCompanies.length} companies
            </p>
          </div>
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
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200 hover:shadow-md transition-shadow">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-3xl font-bold text-blue-700">{statistics.total}</div>
                  <div className="text-sm font-medium text-blue-600">Total Companies</div>
                </div>
                <Users className="h-10 w-10 text-blue-500" />
              </div>
              <div className="mt-3 flex items-center text-xs text-blue-600">
                <TrendingUp className="h-3 w-3 mr-1" />+{statistics.companiesThisWeek} this week (
                {statistics.weeklyGrowth.toFixed(1)}%)
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
              <div className="mt-3 text-xs text-amber-600">
                {statistics.new} new + {statistics.vetting} vetting
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
              <div className="mt-3 text-xs text-emerald-600">{statistics.vetted} vetted ready for review</div>
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

      <CompanyFiltersComponent filters={filters} onFiltersChange={setFilters} companies={companies} />

      <div
        ref={tableRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        className={isDragging ? "select-none" : ""}
      >
        <CompanyTable
          companies={paginatedCompanies}
          loading={loading}
          selectedCompanies={selectedCompanies}
          onSelectedCompaniesChange={setSelectedCompanies}
          onCompanyClick={setSelectedCompany}
          onRefresh={onRefresh}
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          itemsPerPage={itemsPerPage}
          onItemsPerPageChange={setItemsPerPage}
          totalResults={filteredCompanies.length}
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
  )
}