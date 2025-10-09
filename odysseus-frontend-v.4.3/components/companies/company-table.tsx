"use client"

import type { Company, Status } from "@/lib/types"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Card, CardFooter } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { MoreHorizontal, ArrowUpDown, Trash2, FolderOpen, CheckCircle, XCircle } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { apiClient } from "@/lib/api"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from "@/components/ui/pagination"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type SortField =
  | "name"
  | "domain"
  | "status"
  | "unified_score"
  | "geography_score"
  | "industry_score"
  | "russia_score"
  | "size_score"
  | "created_at"

interface CompanyTableProps {
  companies: Company[]
  loading: boolean
  selectedCompanies: number[]
  onSelectedCompaniesChange: (ids: number[]) => void
  onCompanyClick: (company: Company) => void
  onRefresh: () => void
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
  itemsPerPage: number
  onItemsPerPageChange: (value: number) => void
  totalResults: number
  sortBy: string
  sortDir: string
  onSortChange: (field: SortField) => void
}


const statusColors: Record<Status, string> = {
  New: "bg-blue-100 text-blue-800 border-blue-200",
  Vetting: "bg-amber-100 text-amber-800 border-amber-200",
  Vetted: "bg-purple-100 text-purple-800 border-purple-200",
  Approved: "bg-emerald-100 text-emerald-800 border-emerald-200",
  Failed: "bg-red-100 text-red-800 border-red-200",
  Rejected: "bg-gray-100 text-gray-800 border-gray-200",
}

export function CompanyTable({
  companies,
  loading,
  selectedCompanies,
  onSelectedCompaniesChange,
  onCompanyClick,
  onRefresh,
  currentPage,
  totalPages,
  onPageChange,
  itemsPerPage,
  onItemsPerPageChange,
  totalResults,
  sortBy,
  sortDir,
  onSortChange,
}: CompanyTableProps) {
  const { toast } = useToast()

  const handleSelectAll = (checked: boolean) => {
    onSelectedCompaniesChange(checked ? companies.map((c) => c.id) : [])
  }

  const handleSelectCompany = (companyId: number, checked: boolean) => {
    onSelectedCompaniesChange(
      checked ? [...selectedCompanies, companyId] : selectedCompanies.filter((id) => id !== companyId),
    )
  }

  const handleDeleteSelected = async () => {
    if (selectedCompanies.length === 0) return

    try {
      await apiClient.deleteCompanies(selectedCompanies)
      toast({
        title: "Companies Deleted",
        description: `Deleted ${selectedCompanies.length} companies.`,
      })
      onSelectedCompaniesChange([])
      setTimeout(onRefresh, 100)
    } catch (error) {
      console.error("Failed to delete companies:", error)
      toast({
        title: "Error",
        description: "Failed to delete companies.",
        variant: "destructive",
      })
    }
  }

    const renderPaginationItems = () => {
    if (totalPages <= 1) return null;
    const pageNumbers = [];
    const visiblePages = 2;

    pageNumbers.push(1);

    if (currentPage > visiblePages + 2) {
      pageNumbers.push("...");
    }

    const startPage = Math.max(2, currentPage - visiblePages);
    const endPage = Math.min(totalPages - 1, currentPage + visiblePages);
    for (let i = startPage; i <= endPage; i++) {
      pageNumbers.push(i);
    }

    if (currentPage < totalPages - visiblePages - 1) {
      pageNumbers.push("...");
    }

    if (totalPages > 1) {
      pageNumbers.push(totalPages);
    }

    const uniquePageNumbers = [...new Set(pageNumbers)];

    return uniquePageNumbers.map((page, index) => (
      <PaginationItem key={`${page}-${index}`}>
        {page === "..." ? (
          <PaginationEllipsis />
        ) : (
          <PaginationLink
            href="#"
            onClick={(e) => {
              e.preventDefault();
              onPageChange(page as number);
            }}
            isActive={currentPage === page}
          >
            {page}
          </PaginationLink>
        )}
      </PaginationItem>
    ));
  };


  if (loading) {
    return (
      <Card className="p-6">
        <div className="space-y-4">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="flex items-center space-x-4">
              <Skeleton className="h-4 w-4" />
              <Skeleton className="h-4 w-[200px]" />
              <Skeleton className="h-4 w-[150px]" />
              <Skeleton className="h-4 w-[100px]" />
              <Skeleton className="h-4 w-[80px]" />
            </div>
          ))}
        </div>
      </Card>
    )
  }

  return (
    <Card>
      <div className="p-4">
        {selectedCompanies.length > 0 && (
          <div className="flex items-center justify-between mb-4 p-3 bg-muted rounded-md">
            {/* <span className="text-sm font-medium text-muted-foreground">{selectedCompanies.length} selected</span>
            <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="gap-2 bg-transparent" onClick={() => {}}>
                    <CheckCircle className="h-4 w-4 text-green-600"/> Approve
                </Button>
                 <Button variant="outline" size="sm" className="gap-2 bg-transparent" onClick={() => {}}>
                    <XCircle className="h-4 w-4 text-orange-600"/> Reject
                </Button>
                <Button variant="destructive" size="sm" onClick={handleDeleteSelected} className="gap-2">
                  <Trash2 className="h-4 w-4" />
                  Delete
                </Button>
            </div> */}
          </div>
      )}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <Checkbox
                  checked={selectedCompanies.length === companies.length && companies.length > 0}
                  onCheckedChange={handleSelectAll}
                />
              </TableHead>
              <TableHead>
                <Button variant="ghost" onClick={() => onSortChange("name")} className="gap-2 p-0 h-auto font-medium">
                  Company
                  <ArrowUpDown className="h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead>
                <Button variant="ghost" onClick={() => onSortChange("status")} className="gap-2 p-0 h-auto font-medium">
                  Status
                  <ArrowUpDown className="h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  onClick={() => onSortChange("unified_score")}
                  className="gap-2 p-0 h-auto font-medium"
                >
                  Unified
                  <ArrowUpDown className="h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  onClick={() => onSortChange("geography_score")}
                  className="gap-2 p-0 h-auto font-medium"
                >
                  Geo
                  <ArrowUpDown className="h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  onClick={() => onSortChange("industry_score")}
                  className="gap-2 p-0 h-auto font-medium"
                >
                  Industry
                  <ArrowUpDown className="h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  onClick={() => onSortChange("russia_score")}
                  className="gap-2 p-0 h-auto font-medium"
                >
                  Russia
                  <ArrowUpDown className="h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  onClick={() => onSortChange("size_score")}
                  className="gap-2 p-0 h-auto font-medium"
                >
                  Size
                  <ArrowUpDown className="h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  onClick={() => onSortChange("created_at")}
                  className="gap-2 p-0 h-auto font-medium"
                >
                  Added
                  <ArrowUpDown className="h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead>Group</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {companies.map((company) => (
              <TableRow
                key={company.id}
                data-company-row
                data-company-id={company.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => onCompanyClick(company)}
              >
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={selectedCompanies.includes(company.id)}
                    onCheckedChange={(checked) => handleSelectCompany(company.id, checked as boolean)}
                  />
                </TableCell>
                <TableCell>
                  <div>
                    <div className="font-medium">{company.name || company.domain}</div>
                    {company.name && <div className="text-sm text-muted-foreground">{company.domain}</div>}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge className={statusColors[company.status]} variant="outline">
                    {company.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  {company.unified_score != null ? (
                    <div className="font-medium">{company.unified_score.toFixed(1)}</div>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell>
                  {company.geography_score != null ? (
                    <div className="font-medium">{company.geography_score.toFixed(1)}</div>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell>
                  {company.industry_score != null ? (
                    <div className="font-medium">{company.industry_score.toFixed(1)}</div>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell>
                  {company.russia_score != null ? (
                    <div className="font-medium">{company.russia_score.toFixed(1)}</div>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell>
                  {company.size_score != null ? (
                    <div className="font-medium">{company.size_score.toFixed(1)}</div>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="text-sm text-muted-foreground">
                    {company.created_at ? new Date(company.created_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    }) : "N/A"}
                  </div>
                </TableCell>
                <TableCell>
                  {company.group_name ? (
                    <Badge variant="outline">{company.group_name}</Badge>
                  ) : (
                    <span className="text-muted-foreground">No Group</span>
                  )}
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="h-8 w-8 p-0">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onCompanyClick(company)}>
                        <FolderOpen className="mr-2 h-4 w-4" />
                        View Details
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {companies.length === 0 && !loading && (
          <div className="text-center py-8 text-muted-foreground">
            No companies found. Add some companies to get started.
          </div>
        )}
      </div>

      {totalResults > 0 && (
        <CardFooter className="flex items-center justify-between border-t pt-4">
          <div className="text-sm text-muted-foreground">
            <strong>{totalResults}</strong> {totalResults === 1 ? "result" : "results"} found
          </div>

          {totalPages > 1 && (
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Rows:</span>
                <Select
                  value={String(itemsPerPage)}
                  onValueChange={(value) => onItemsPerPageChange(Number(value))}
                >
                  <SelectTrigger className="h-8 w-[70px]">
                    <SelectValue placeholder={itemsPerPage} />
                  </SelectTrigger>
                  <SelectContent>
                    {[10, 20, 50, 100].map((size) => (
                      <SelectItem key={size} value={String(size)}>
                        {size}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        if (currentPage > 1) onPageChange(currentPage - 1);
                      }}
                      className={currentPage === 1 ? "pointer-events-none opacity-50" : ""}
                    />
                  </PaginationItem>
                  {renderPaginationItems()}
                  <PaginationItem>
                    <PaginationNext
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        if (currentPage < totalPages) onPageChange(currentPage + 1);
                      }}
                      className={currentPage === totalPages ? "pointer-events-none opacity-50" : ""}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </CardFooter>
      )}
    </Card>
  )
}