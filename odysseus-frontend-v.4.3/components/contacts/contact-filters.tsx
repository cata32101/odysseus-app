"use client"

import type { Contact } from "@/lib/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { X, Search } from "lucide-react"

interface ContactFiltersProps {
  filters: any
  onFiltersChange: (filters: any) => void
  contacts: Contact[]
}

export function ContactFilters({ filters, onFiltersChange, contacts }: ContactFiltersProps) {
  const statuses = ["Sourced", "Pending Enrichment", "Enriched", "Failed Enrichment"]
  const campaignStatuses = ["Ready to Assign", "In Campaign"]
  const companyNames = [...new Set(contacts.map((c) => c.company_name).filter(Boolean))]

  const handleStatusToggle = (status: string) => {
    const newStatuses = filters.status.includes(status)
      ? filters.status.filter((s: string) => s !== status)
      : [...filters.status, status]

    onFiltersChange({ ...filters, status: newStatuses })
  }

  const handleCampaignStatusToggle = (status: string) => {
    const newStatuses = filters.campaignStatus.includes(status)
      ? filters.campaignStatus.filter((s: string) => s !== status)
      : [...filters.campaignStatus, status]

    onFiltersChange({ ...filters, campaignStatus: newStatuses })
  }

  const handleCompanyToggle = (company: string) => {
    const newCompanies = filters.companyName.includes(company)
      ? filters.companyName.filter((c: string) => c !== company)
      : [...filters.companyName, company]

    onFiltersChange({ ...filters, companyName: newCompanies })
  }

  const clearFilters = () => {
    onFiltersChange({
      search: "",
      status: [],
      campaignStatus: [],
      companyName: [],
    })
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Filters</CardTitle>
        <Button variant="outline" size="sm" onClick={clearFilters}>
          Clear All
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Search */}
        <div className="space-y-2">
          <Label>Search</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, company, or title..."
              value={filters.search}
              onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
              className="pl-10"
            />
          </div>
        </div>

        {/* Status Filter */}
        <div className="space-y-2">
          <Label>Status</Label>
          <div className="flex flex-wrap gap-2">
            {statuses.map((status) => (
              <Badge
                key={status}
                variant={filters.status.includes(status) ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => handleStatusToggle(status)}
              >
                {status}
                {filters.status.includes(status) && <X className="ml-1 h-3 w-3" />}
              </Badge>
            ))}
          </div>
        </div>

        {/* Campaign Status Filter */}
        <div className="space-y-2">
          <Label>Campaign Status</Label>
          <div className="flex flex-wrap gap-2">
            {campaignStatuses.map((status) => (
              <Badge
                key={status}
                variant={filters.campaignStatus.includes(status) ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => handleCampaignStatusToggle(status)}
              >
                {status}
                {filters.campaignStatus.includes(status) && <X className="ml-1 h-3 w-3" />}
              </Badge>
            ))}
          </div>
        </div>

        {/* Company Filter */}
        {companyNames.length > 0 && (
          <div className="space-y-2">
            <Label>Companies</Label>
            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
              {companyNames.slice(0, 20).map((company) => (
                <Badge
                  key={company}
                  variant={filters.companyName.includes(company) ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => handleCompanyToggle(company)}
                >
                  {company}
                  {filters.companyName.includes(company) && <X className="ml-1 h-3 w-3" />}
                </Badge>
              ))}
              {companyNames.length > 20 && (
                <span className="text-xs text-muted-foreground">+{companyNames.length - 20} more...</span>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
