"use client"

import type { Company } from "@/lib/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Loader2, Play, Clock } from "lucide-react"

interface VettingWorkflowProps {
  vettingCompanies: Company[]
  newCompanies: Company[]
  onVetCompanies: (companyIds: number[]) => void
}

export function VettingWorkflow({ vettingCompanies, newCompanies, onVetCompanies }: VettingWorkflowProps) {
  const handleVetAll = () => {
    const newCompanyIds = newCompanies.map((c) => c.id)
    onVetCompanies(newCompanyIds)
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Vetting in Progress */}
      {vettingCompanies.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base font-medium">Vetting in Progress</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-yellow-600" />
                <span className="text-sm font-medium">{vettingCompanies.length} companies being analyzed</span>
              </div>

              <div className="space-y-2">
                {vettingCompanies.slice(0, 3).map((company) => (
                  <div key={company.id} className="flex items-center justify-between text-sm">
                    <span className="truncate">{company.name || company.domain}</span>
                    <Badge variant="outline" className="text-yellow-600 border-yellow-600">
                      Vetting
                    </Badge>
                  </div>
                ))}
                {vettingCompanies.length > 3 && (
                  <div className="text-xs text-muted-foreground">+{vettingCompanies.length - 3} more...</div>
                )}
              </div>

              <div className="pt-2">
                <div className="text-xs text-muted-foreground mb-1">AI analysis in progress...</div>
                <Progress value={75} className="h-2" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* New Companies Ready for Vetting */}
      {newCompanies.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base font-medium">Ready for Vetting</CardTitle>
            <Play className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{newCompanies.length} companies ready</span>
                <Button size="sm" onClick={handleVetAll} className="gap-2">
                  <Play className="h-3 w-3" />
                  Vet All
                </Button>
              </div>

              <div className="space-y-2">
                {newCompanies.slice(0, 3).map((company) => (
                  <div key={company.id} className="flex items-center justify-between text-sm">
                    <span className="truncate">{company.name || company.domain}</span>
                    <Badge variant="outline" className="text-blue-600 border-blue-600">
                      New
                    </Badge>
                  </div>
                ))}
                {newCompanies.length > 3 && (
                  <div className="text-xs text-muted-foreground">+{newCompanies.length - 3} more...</div>
                )}
              </div>

              <div className="pt-2 text-xs text-muted-foreground">
                Start AI-powered analysis including Apollo enrichment, web research, and scoring.
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
