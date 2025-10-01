"use client"

import type { Company } from "@/lib/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Sparkles, Users, Building2 } from "lucide-react"

interface EnrichmentWorkflowProps {
  sourcedContacts: Array<{
    company: Company
    contactCount: number
  }>
  onEnrichContact: (contactId: number) => void
  onBulkEnrich: (contactIds: number[]) => void
}

export function EnrichmentWorkflow({ sourcedContacts, onEnrichContact, onBulkEnrich }: EnrichmentWorkflowProps) {
  const totalContacts = sourcedContacts.reduce((sum, item) => sum + item.contactCount, 0)

  const handleEnrichAll = () => {
    // This would need to be implemented to get all sourced contact IDs
    // For now, we'll show the concept
    console.log("Enrich all contacts from approved companies")
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          Contact Enrichment Workflow
        </CardTitle>
        {totalContacts > 0 && (
          <Button size="sm" onClick={handleEnrichAll} className="gap-2">
            <Sparkles className="h-3 w-3" />
            Enrich All ({totalContacts})
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {sourcedContacts.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground">
            <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No contacts ready for enrichment.</p>
            <p className="text-sm">Approve companies to source contacts first.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground mb-3">
              {totalContacts} contacts from {sourcedContacts.length} approved companies ready for AI enrichment
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {sourcedContacts.map(({ company, contactCount }) => (
                <div key={company.id} className="flex items-center justify-between p-3 border rounded-lg bg-muted/30">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="font-medium text-sm">{company.name || company.domain}</div>
                      <div className="text-xs text-muted-foreground">{contactCount} contacts</div>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-blue-600 border-blue-600">
                    Sourced
                  </Badge>
                </div>
              ))}
            </div>

            <div className="pt-2 text-xs text-muted-foreground">
              Enrichment includes: Email revelation, Russia ties analysis, and personalized outreach message generation.
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
