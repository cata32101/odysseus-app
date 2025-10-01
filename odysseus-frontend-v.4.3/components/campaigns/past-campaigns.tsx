"use client"

import { useState } from "react"
import type { PastCampaign, PastCampaignContact } from "@/lib/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { Archive, Mail, Linkedin, Users, Calendar, Eye, Building2 } from "lucide-react"
import { apiClient } from "@/lib/api"

interface PastCampaignsProps {
  pastCampaigns: PastCampaign[]
  loading: boolean
}

export function PastCampaigns({ pastCampaigns, loading }: PastCampaignsProps) {
  const [selectedCampaign, setSelectedCampaign] = useState<PastCampaign | null>(null)
  const [campaignContacts, setCampaignContacts] = useState<PastCampaignContact[]>([])
  const [loadingContacts, setLoadingContacts] = useState(false)

  const handleViewCampaign = async (campaign: PastCampaign) => {
    setSelectedCampaign(campaign)
    setLoadingContacts(true)

    try {
      const contacts = await apiClient.getPastCampaignDetails(campaign.id)
      setCampaignContacts(contacts)
    } catch (error) {
      console.error("Failed to load campaign details:", error)
    } finally {
      setLoadingContacts(false)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Archive className="h-4 w-4" />
            Past Campaigns
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center space-x-4">
                <Skeleton className="h-4 w-4" />
                <Skeleton className="h-4 w-[200px]" />
                <Skeleton className="h-4 w-[100px]" />
                <Skeleton className="h-4 w-[80px]" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Archive className="h-4 w-4" />
            Past Campaigns ({pastCampaigns.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {pastCampaigns.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Archive className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No archived campaigns yet.</p>
              <p className="text-sm">Archived campaigns will appear here.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Contacts</TableHead>
                  <TableHead>Archived Date</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pastCampaigns.map((campaign) => (
                  <TableRow key={campaign.id}>
                    <TableCell>
                      <div className="font-medium">{campaign.name}</div>
                    </TableCell>
                    <TableCell>
                      <Badge className="gap-2">
                        {campaign.campaign_type === "email" ? (
                          <Mail className="h-3 w-3" />
                        ) : (
                          <Linkedin className="h-3 w-3" />
                        )}
                        {campaign.campaign_type === "email" ? "Email" : "LinkedIn"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <span>{campaign.contacts_count}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{formatDate(campaign.archived_at)}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost" onClick={() => handleViewCampaign(campaign)} className="gap-2">
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Campaign Details Dialog */}
      {selectedCampaign && (
        <Dialog open={!!selectedCampaign} onOpenChange={() => setSelectedCampaign(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {selectedCampaign.campaign_type === "email" ? (
                  <Mail className="h-5 w-5" />
                ) : (
                  <Linkedin className="h-5 w-5" />
                )}
                {selectedCampaign.name}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              {/* Campaign Info */}
              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardContent className="pt-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold">{selectedCampaign.contacts_count}</div>
                      <div className="text-sm text-muted-foreground">Total Contacts</div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-4">
                    <div className="text-center">
                      <Badge className="gap-2">
                        {selectedCampaign.campaign_type === "email" ? (
                          <Mail className="h-3 w-3" />
                        ) : (
                          <Linkedin className="h-3 w-3" />
                        )}
                        {selectedCampaign.campaign_type === "email" ? "Email" : "LinkedIn"}
                      </Badge>
                      <div className="text-sm text-muted-foreground mt-1">Campaign Type</div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-4">
                    <div className="text-center">
                      <div className="text-sm font-medium">{formatDate(selectedCampaign.archived_at)}</div>
                      <div className="text-sm text-muted-foreground">Archived Date</div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Campaign Contacts */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Campaign Contacts</CardTitle>
                </CardHeader>
                <CardContent>
                  {loadingContacts ? (
                    <div className="space-y-4">
                      {[...Array(5)].map((_, i) => (
                        <div key={i} className="flex items-center space-x-4">
                          <Skeleton className="h-4 w-[200px]" />
                          <Skeleton className="h-4 w-[150px]" />
                          <Skeleton className="h-4 w-[100px]" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Contact</TableHead>
                          <TableHead>Company</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Final Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {campaignContacts.map((item) => {
                          const contact = item.contact_data
                          return (
                            <TableRow key={item.id}>
                              <TableCell>
                                <div>
                                  <div className="font-medium text-sm">{contact.name}</div>
                                  {contact.title && (
                                    <div className="text-xs text-muted-foreground">{contact.title}</div>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Building2 className="h-3 w-3 text-muted-foreground" />
                                  <span className="text-sm">{contact.company_name}</span>
                                </div>
                              </TableCell>
                              <TableCell>
                                {contact.email ? (
                                  <div className="flex items-center gap-2">
                                    <Mail className="h-3 w-3 text-green-600" />
                                    <span className="text-sm">{contact.email}</span>
                                  </div>
                                ) : (
                                  <span className="text-sm text-muted-foreground">No email</span>
                                )}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline">{contact.campaign_status || "Completed"}</Badge>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
