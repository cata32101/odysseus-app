"use client"

import { useState, useEffect } from "react"
import type { Contact, PastCampaign } from "@/lib/types"
import { CampaignBuilder } from "./campaign-builder"
import { ActiveCampaigns } from "./active-campaigns"
import { PastCampaigns } from "./past-campaigns"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Mail, Linkedin, Archive, Plus } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { apiClient } from "@/lib/api"

interface CampaignsViewProps {
  contacts: Contact[]
  loading: boolean
  onRefresh: () => void
}

export function CampaignsView({ contacts, loading, onRefresh }: CampaignsViewProps) {
  const [pastCampaigns, setPastCampaigns] = useState<PastCampaign[]>([])
  const [loadingPastCampaigns, setLoadingPastCampaigns] = useState(true)
  const { toast } = useToast()

  // Load past campaigns
  useEffect(() => {
    const loadPastCampaigns = async () => {
      try {
        const campaigns = await apiClient.getPastCampaigns()
        setPastCampaigns(campaigns)
      } catch (error) {
        console.error("Failed to load past campaigns:", error)
      } finally {
        setLoadingPastCampaigns(false)
      }
    }

    loadPastCampaigns()
  }, [])

  const handleArchiveCampaign = async (campaignType: "email" | "linkedin", campaignName: string) => {
    try {
      await apiClient.archiveCampaign(campaignType, campaignName)
      toast({
        title: "Campaign Archived",
        description: `${campaignType} campaign "${campaignName}" has been archived.`,
      })
      onRefresh()
      // Reload past campaigns
      const campaigns = await apiClient.getPastCampaigns()
      setPastCampaigns(campaigns)
    } catch (error) {
      console.error("Failed to archive campaign:", error)
      toast({
        title: "Error",
        description: "Failed to archive campaign.",
        variant: "destructive",
      })
    }
  }

  // Get campaign statistics
  const enrichedContacts = contacts.filter((c) => c.status === "Enriched")
  const readyToAssign = enrichedContacts.filter((c) => c.campaign_status === "Ready to Assign" || !c.campaign_status)
  const inEmailCampaign = enrichedContacts.filter(
    (c) => c.campaign_status === "In Campaign" && c.campaign_type === "email",
  )
  const inLinkedInCampaign = enrichedContacts.filter(
    (c) => c.campaign_status === "In Campaign" && c.campaign_type === "linkedin",
  )

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Mail className="h-6 w-6 text-primary" />
          <div>
            <h3 className="text-lg font-medium">Campaign Management</h3>
            <p className="text-sm text-muted-foreground">Manage outreach campaigns and track performance</p>
          </div>
        </div>
      </div>

      {/* Campaign Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ready to Assign</CardTitle>
            <Plus className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{readyToAssign.length}</div>
            <p className="text-xs text-muted-foreground">Enriched contacts available</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Email Campaign</CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{inEmailCampaign.length}</div>
            <p className="text-xs text-muted-foreground">Active email contacts</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">LinkedIn Campaign</CardTitle>
            <Linkedin className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{inLinkedInCampaign.length}</div>
            <p className="text-xs text-muted-foreground">Active LinkedIn contacts</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Past Campaigns</CardTitle>
            <Archive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pastCampaigns.length}</div>
            <p className="text-xs text-muted-foreground">Archived campaigns</p>
          </CardContent>
        </Card>
      </div>

      {/* Campaign Management Tabs */}
      <Tabs defaultValue="create" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="create">Create Campaign</TabsTrigger>
          <TabsTrigger value="active">Active Campaigns</TabsTrigger>
          <TabsTrigger value="past">Past Campaigns</TabsTrigger>
        </TabsList>

        <TabsContent value="create" className="space-y-4">
          <CampaignBuilder enrichedContacts={enrichedContacts} readyToAssign={readyToAssign} onRefresh={onRefresh} />
        </TabsContent>

        <TabsContent value="active" className="space-y-4">
          <ActiveCampaigns
            inEmailCampaign={inEmailCampaign}
            inLinkedInCampaign={inLinkedInCampaign}
            onArchiveCampaign={handleArchiveCampaign}
          />
        </TabsContent>

        <TabsContent value="past" className="space-y-4">
          <PastCampaigns pastCampaigns={pastCampaigns} loading={loadingPastCampaigns} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
