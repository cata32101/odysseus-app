"use client"

import type React from "react"

import { useState } from "react"
import type { Contact } from "@/lib/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Mail, Linkedin, Archive, Users, Building2 } from "lucide-react"

interface ActiveCampaignsProps {
  inEmailCampaign: Contact[]
  inLinkedInCampaign: Contact[]
  onArchiveCampaign: (campaignType: "email" | "linkedin", campaignName: string) => void
}

export function ActiveCampaigns({ inEmailCampaign, inLinkedInCampaign, onArchiveCampaign }: ActiveCampaignsProps) {
  const [showArchiveDialog, setShowArchiveDialog] = useState(false)
  const [archiveCampaignType, setArchiveCampaignType] = useState<"email" | "linkedin">("email")
  const [archiveCampaignName, setArchiveCampaignName] = useState("")

  const handleArchiveClick = (campaignType: "email" | "linkedin") => {
    setArchiveCampaignType(campaignType)
    setArchiveCampaignName("")
    setShowArchiveDialog(true)
  }

  const handleConfirmArchive = () => {
    if (archiveCampaignName.trim()) {
      onArchiveCampaign(archiveCampaignType, archiveCampaignName.trim())
      setShowArchiveDialog(false)
    }
  }

  const CampaignCard = ({
    title,
    icon,
    contacts,
    campaignType,
  }: {
    title: string
    icon: React.ReactNode
    contacts: Contact[]
    campaignType: "email" | "linkedin"
  }) => (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
        {contacts.length > 0 && (
          <Button size="sm" variant="outline" onClick={() => handleArchiveClick(campaignType)} className="gap-2">
            <Archive className="h-4 w-4" />
            Archive Campaign
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {contacts.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No active {campaignType} campaign.</p>
            <p className="text-sm">Create a campaign to get started.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Active Contacts:</span>
              <Badge>{contacts.length}</Badge>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Companies:</span>
              <span className="text-sm">{new Set(contacts.map((c) => c.company_name)).size}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">With Email:</span>
              <span className="text-sm">{contacts.filter((c) => c.email).length}</span>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contact</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.slice(0, 5).map((contact) => (
                  <TableRow key={contact.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium text-sm">{contact.name}</div>
                        {contact.title && <div className="text-xs text-muted-foreground">{contact.title}</div>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Building2 className="h-3 w-3 text-muted-foreground" />
                        <span className="text-sm">{contact.company_name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-purple-600 border-purple-600">
                        In Campaign
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {contacts.length > 5 && (
              <div className="text-xs text-muted-foreground text-center">+{contacts.length - 5} more contacts</div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <CampaignCard
          title="Email Campaign"
          icon={<Mail className="h-4 w-4" />}
          contacts={inEmailCampaign}
          campaignType="email"
        />

        <CampaignCard
          title="LinkedIn Campaign"
          icon={<Linkedin className="h-4 w-4" />}
          contacts={inLinkedInCampaign}
          campaignType="linkedin"
        />
      </div>

      {/* Archive Campaign Dialog */}
      <Dialog open={showArchiveDialog} onOpenChange={setShowArchiveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive {archiveCampaignType} Campaign</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This will archive the current {archiveCampaignType} campaign and move all contacts to the archived state.
              You can create a new campaign afterwards.
            </p>

            <div className="space-y-2">
              <Label htmlFor="campaignName">Campaign Name</Label>
              <Input
                id="campaignName"
                placeholder="e.g., Q1 2024 Outreach"
                value={archiveCampaignName}
                onChange={(e) => setArchiveCampaignName(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowArchiveDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleConfirmArchive} disabled={!archiveCampaignName.trim()} className="gap-2">
              <Archive className="h-4 w-4" />
              Archive Campaign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
