"use client"

import { useState, useEffect } from "react"
import type { Company } from "@/lib/types"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ExternalLink, CheckCircle, XCircle, Building2, Globe, Users, MapPin, Download, UserPlus, Loader2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { apiClient } from "@/lib/api"

interface CompanyDetailModalProps {
  company: Company
  open: boolean
  onOpenChange: (open: boolean) => void
  onApprove: () => void
  onReject: () => void
}

const ScoreCard = ({
  title,
  score,
  reasoning,
  sources,
}: {
  title: string
  score?: number | null
  reasoning?: string
  sources?: any[]
}) => (
  <Card>
    <CardHeader className="pb-3">
      <div className="flex items-center justify-between">
        <CardTitle className="text-base">{title}</CardTitle>
        {score != null && (
          <Badge variant={score >= 7 ? "default" : score >= 4 ? "secondary" : "destructive"}>{score}/10</Badge>
        )}
      </div>
    </CardHeader>
    <CardContent className="space-y-3">
      {reasoning && <p className="text-sm text-muted-foreground leading-relaxed">{reasoning}</p>}
      {sources && sources.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Sources</h4>
          {sources.slice(0, 3).map((source, index) => (
            <div key={index} className="text-xs">
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline flex items-center gap-1"
              >
                {source.name || source.url}
                <ExternalLink className="h-3 w-3" />
              </a>
              {source.snippet && <p className="text-muted-foreground mt-1 line-clamp-2">{source.snippet}</p>}
            </div>
          ))}
        </div>
      )}
    </CardContent>
  </Card>
)

const AnalysisCard = ({ title, content }: { title: string; content?: string }) => {
  if (!content) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{content}</p>
      </CardContent>
    </Card>
  )
}

export function CompanyDetailModal({ company, open, onOpenChange, onApprove, onReject }: CompanyDetailModalProps) {
  const [contacts, setContacts] = useState<any[]>([])
  const [loadingContacts, setLoadingContacts] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const { toast } = useToast()

  const canApproveReject = company.status === "Vetted"
  const apolloOrg = company.apollo_data?.organization

  useEffect(() => {
    if (open && company.status === "Approved") {
      loadContacts()
    }
  }, [open, company.status, company.id])

  const handleApprove = async () => {
    setIsUpdating(true)
    try {
      await onApprove()
    } finally {
      setIsUpdating(false)
    }
  }

  const handleReject = async () => {
    setIsUpdating(true)
    try {
      await onReject()
    } finally {
      setIsUpdating(false)
    }
  }

  const handleDownloadPDF = async () => {
    try {
      const response = await apiClient.downloadCompanyPDF(company.id)
      const blob = new Blob([response], { type: "application/pdf" })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.style.display = "none"
      a.href = url
      a.download = `${company.name || company.domain}-profile.pdf`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      toast({
        title: "PDF Downloaded",
        description: "Company profile has been downloaded successfully.",
      })
    } catch (error) {
      console.error("Failed to download PDF:", error)
      toast({
        title: "Error",
        description: "Failed to download company profile.",
        variant: "destructive",
      })
    }
  }

  const handleEnrichContact = async (contactId: number) => {
    try {
      await apiClient.enrichContact(contactId)
      toast({
        title: "Contact Enriched",
        description: "Contact enrichment has been started.",
      })
      loadContacts()
    } catch (error) {
      console.error("Failed to enrich contact:", error)
      toast({
        title: "Error",
        description: "Failed to enrich contact.",
        variant: "destructive",
      })
    }
  }

  const loadContacts = async () => {
    if (company.status !== "Approved") return

    setLoadingContacts(true)
    try {
      const response = await apiClient.getCompanyContacts(company.id)
      setContacts(response)
    } catch (error) {
      console.error("Failed to load contacts:", error)
    } finally {
      setLoadingContacts(false)
    }
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return "N/A"
    try {
      const date = new Date(dateString)
      if (isNaN(date.getTime())) {
        return "Invalid Date"
      }
      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    } catch (error) {
      return "Invalid Date"
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Building2 className="h-6 w-6 text-primary" />
              <div>
                <DialogTitle className="text-xl">{company.name || company.domain}</DialogTitle>
                {company.name && <p className="text-sm text-muted-foreground">{company.domain}</p>}
                <p className="text-xs text-muted-foreground">Added: {formatDate(company.created_at)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleDownloadPDF} className="gap-2 bg-transparent">
                <Download className="h-4 w-4" />
                Download PDF
              </Button>
              <Badge
                className={`${
                  company.status === "Approved"
                    ? "bg-green-100 text-green-800"
                    : company.status === "Vetted"
                    ? "bg-blue-100 text-blue-800"
                    : company.status === "Vetting"
                    ? "bg-yellow-100 text-yellow-800"
                    : company.status === "Rejected"
                    ? "bg-red-100 text-red-800"
                    : "bg-gray-100 text-gray-800"
                }`}
              >
                {company.status}
              </Badge>
            </div>
          </div>
        </DialogHeader>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="scores">Detailed Scores</TabsTrigger>
            <TabsTrigger value="analysis">Analysis</TabsTrigger>
            <TabsTrigger value="sources">Sources</TabsTrigger>
            {company.status === "Approved" && <TabsTrigger value="contacts">Contacts</TabsTrigger>}
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    Company Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    <a
                      href={company.website_url || `https://${company.domain}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      {company.website_url || company.domain}
                    </a>
                  </div>

                  {company.company_linkedin_url && (
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <a
                        href={company.company_linkedin_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        LinkedIn Profile
                      </a>
                    </div>
                  )}

                  {apolloOrg?.industry && (
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{apolloOrg.industry}</span>
                    </div>
                  )}

                  {company.group_name && (
                    <div>
                      <span className="text-sm font-medium">Group: </span>
                      <Badge variant="outline">{company.group_name}</Badge>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Unified Score</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-primary mb-2">
                      {company.unified_score != null ? `${company.unified_score.toFixed(1)}/10` : "N/A"}
                    </div>
                    <div className="text-sm text-muted-foreground">Overall investment fit score</div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Score Breakdown</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {[
                    { label: "Geography", score: company.geography_score },
                    { label: "Industry", score: company.industry_score },
                    { label: "Russia Ties", score: company.russia_score },
                    { label: "Size", score: company.size_score },
                  ].map(({ label, score }) => (
                    <div key={label} className="flex justify-between items-center">
                      <span className="text-sm">{label}</span>
                      {score != null ? (
                        <Badge
                          variant={score >= 7 ? "default" : score >= 4 ? "secondary" : "destructive"}
                          className="text-xs"
                        >
                          {score.toFixed(1)}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">-</span>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Company Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {apolloOrg?.employees && (
                    <div className="flex justify-between">
                      <span className="text-sm">Employees:</span>
                      <span className="text-sm font-medium">{apolloOrg.employees}</span>
                    </div>
                  )}
                  {apolloOrg?.founded_year && (
                    <div className="flex justify-between">
                      <span className="text-sm">Founded:</span>
                      <span className="text-sm font-medium">{apolloOrg.founded_year}</span>
                    </div>
                  )}
                  {company.company_size && (
                    <div className="flex justify-between">
                      <span className="text-sm">Size:</span>
                      <span className="text-sm font-medium">{company.company_size}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <AnalysisCard title="Investment Reasoning" content={company.investment_reasoning} />

            {canApproveReject && (
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={handleReject} disabled={isUpdating} className="gap-2 bg-transparent">
                  {isUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                  Reject
                </Button>
                <Button onClick={handleApprove} disabled={isUpdating} className="gap-2">
                  {isUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                  Approve & Source Contacts
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="scores" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
              <ScoreCard
                title="Geography Score"
                score={company.geography_score}
                reasoning={company.geography_reasoning}
                sources={company.geography_sources}
              />
              <ScoreCard
                title="Industry Score"
                score={company.industry_score}
                reasoning={company.industry_reasoning}
                sources={company.industry_sources}
              />
              <ScoreCard
                title="Russia Ties Score"
                score={company.russia_score}
                reasoning={company.russia_reasoning}
                sources={company.russia_sources}
              />
              <ScoreCard
                title="Size Score"
                score={company.size_score}
                reasoning={company.size_reasoning}
                sources={company.size_sources}
              />
            </div>
          </TabsContent>

          <TabsContent value="analysis" className="space-y-4">
            <AnalysisCard title="Business Summary" content={company.business_summary} />
            <AnalysisCard title="Investment Focus" content={company.investments_summary} />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <AnalysisCard title="Russia Ties Analysis" content={company.russia_ties} />
              <AnalysisCard title="Ukraine Ties Analysis" content={company.ukraine_ties_analysis} />
            </div>

            <AnalysisCard title="High-Risk Regions Analysis" content={company.high_risk_regions_analysis} />
          </TabsContent>

          <TabsContent value="sources" className="space-y-4">
            {apolloOrg && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Apollo Organization Data</CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="text-xs bg-muted p-4 rounded-md overflow-auto max-h-96">
                    {JSON.stringify(apolloOrg, null, 2)}
                  </pre>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Full Company Data</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="text-xs bg-muted p-4 rounded-md overflow-auto max-h-96">
                  {JSON.stringify(company, null, 2)}
                </pre>
              </CardContent>
            </Card>
          </TabsContent>

          {company.status === "Approved" && (
            <TabsContent value="contacts" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Sourced Contacts
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {loadingContacts ? (
                    <div className="text-center py-4">Loading contacts...</div>
                  ) : contacts.length > 0 ? (
                    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                      {contacts.map((contact, index) => (
                        <div
                          key={contact.id || index}
                          className="flex items-center justify-between p-4 border rounded-lg bg-muted/20"
                        >
                          <div className="flex-1">
                            <div className="font-medium">{contact.name}</div>
                            <div className="text-sm text-muted-foreground">{contact.title}</div>
                            <div className="text-sm text-muted-foreground">{contact.email}</div>
                            {contact.phone && <div className="text-sm text-muted-foreground">{contact.phone}</div>}
                            {contact.linkedin_url && (
                              <a
                                href={contact.linkedin_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-primary hover:underline"
                              >
                                LinkedIn Profile
                              </a>
                            )}
                            <div className="mt-1">
                              <Badge
                                variant="outline"
                                className={
                                  contact.status === "Sourced"
                                    ? "bg-blue-50 text-blue-700"
                                    : "bg-green-50 text-green-700"
                                }
                              >
                                {contact.status}
                              </Badge>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            onClick={() => handleEnrichContact(contact.id)}
                            className="gap-2 ml-4"
                            variant={contact.status === "Enriched" ? "outline" : "default"}
                          >
                            <UserPlus className="h-4 w-4" />
                            {contact.status === "Enriched" ? "Re-enrich" : "Enrich"}
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      No contacts found. Contacts will appear here after approval and sourcing.
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}