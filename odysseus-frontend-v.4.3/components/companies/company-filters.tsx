"use client"

import { useState } from "react"
import type { Company, Status, CompanyFilters } from "@/lib/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Slider } from "@/components/ui/slider"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Switch } from "@/components/ui/switch";
import { X, Search, ChevronDown, Filter } from "lucide-react"

interface CompanyFiltersProps {
  filters: CompanyFilters
  onFiltersChange: (filters: CompanyFilters) => void
  allCompanies: Company[]
}

export function CompanyFiltersComponent({
  filters,
  onFiltersChange,
  allCompanies, 
}: CompanyFiltersProps) {
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false)
  const [localScoreRanges, setLocalScoreRanges] = useState(filters.scoreRanges)

  const statuses: Status[] = ["New", "Vetting", "Vetted", "Approved", "Failed", "Rejected"]
  const groups = [...new Set(allCompanies.map((c: Company) => c.group_name).filter((name): name is string => typeof name === 'string'))]

  const handleStatusToggle = (status: Status) => {
    const newStatuses = filters.status.includes(status)
      ? filters.status.filter((s) => s !== status)
      : [...filters.status, status]

    onFiltersChange({ ...filters, status: newStatuses })
  }

  const handleGroupToggle = (group: string) => {
    const newGroups = filters.group.includes(group)
      ? filters.group.filter((g) => g !== group)
      : [...filters.group, group]

    onFiltersChange({ ...filters, group: newGroups })
  }

  const handleScoreRangeChange = (scoreType: keyof typeof filters.scoreRanges, value: [number, number]) => {
    setLocalScoreRanges({
      ...localScoreRanges,
      [scoreType]: value,
    })
  }

  const applyScoreFilters = () => {
    onFiltersChange({
      ...filters,
      scoreRanges: localScoreRanges,
    })
  }

  const clearFilters = () => {
    const defaultFilters: CompanyFilters = {
      search: "",
      status: [],
      group: [],
      include_null_scores: true,
      scoreRanges: {
        unified: [0, 10],
        geography: [0, 10],
        industry: [0, 10],
        russia: [0, 10],
        size: [0, 10],
      },
    }
    setLocalScoreRanges(defaultFilters.scoreRanges)
    onFiltersChange(defaultFilters)
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by company name or domain..."
              value={filters.search}
              onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      <Collapsible open={isAdvancedOpen} onOpenChange={setIsAdvancedOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="outline" className="w-full justify-between bg-transparent">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Advanced Filters
            </div>
            <ChevronDown className={`h-4 w-4 transition-transform ${isAdvancedOpen ? "rotate-180" : ""}`} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <Card className="mt-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Advanced Filters</CardTitle>
              <Button variant="outline" size="sm" onClick={clearFilters}>
                Clear All
              </Button>
            </CardHeader>
            <CardContent className="space-y-6">
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

              {groups.length > 0 && (
                <div className="space-y-2">
                  <Label>Groups</Label>
                  <div className="flex flex-wrap gap-2">
                    <Badge
                      variant={filters.group.includes("No Group") ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => handleGroupToggle("No Group")}
                    >
                      No Group
                      {filters.group.includes("No Group") && <X className="ml-1 h-3 w-3" />}
                    </Badge>
                    {groups.map((group: string) => (
                      <Badge
                        key={group}
                        variant={filters.group.includes(group) ? "default" : "outline"}
                        className="cursor-pointer"
                        onClick={() => handleGroupToggle(group)}
                      >
                        {group}
                        {filters.group.includes(group) && <X className="ml-1 h-3 w-3" />}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

               <div className="flex items-center space-x-2 pt-4">
                <Switch
                  id="include-null-scores"
                  checked={filters.include_null_scores}
                  onCheckedChange={(checked) =>
                    onFiltersChange({ ...filters, include_null_scores: checked })
                  }
                />
                <Label htmlFor="include-null-scores">
                  Include companies without scores (New, Failed, Vetting)
                </Label>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>Score Ranges</Label>
                  <Button size="sm" onClick={applyScoreFilters}>
                    Apply Score Filters
                  </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {Object.entries(localScoreRanges).map(([scoreType, range]) => (
                    <div key={scoreType} className="space-y-3">
                      <Label className="capitalize">
                        {scoreType === "unified" ? "Unified Score" : `${scoreType.replace('_', ' ')} Score`}
                      </Label>
                      <div className="px-2">
                        <Slider
                          value={range}
                          onValueChange={(value) =>
                            handleScoreRangeChange(scoreType as keyof typeof filters.scoreRanges, value as [number, number])
                          }
                          max={10}
                          min={0}
                          step={scoreType === 'unified' ? 0.1 : 1} // Set step to 1 for integer scores
                          className="w-full"
                        />
                      </div>
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>{range[0].toFixed(1)}</span>
                        <span>{range[1].toFixed(1)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}
