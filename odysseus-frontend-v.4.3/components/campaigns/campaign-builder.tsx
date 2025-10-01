"use client"

import { useState } from "react"
import type { Contact } from "@/lib/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Mail, Linkedin, Users, Send, Building2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { apiClient } from "@/lib/api"

interface CampaignBuilderProps {
  enrichedContacts: Contact[]
  readyToAssign: Contact[]
  onRefresh: () => void
}

export function CampaignBuilder({ enrichedContacts, readyToAssign, onRefresh }: CampaignBuilderProps) {
  const [selectedContacts, setSelectedContacts] = useState<number[]>([])
  const [campaignType, setCampaignType] = useState<"email" | "linkedin">("email")
  const [isCreating, setIsCreating] = useState(false)
  const { toast } = useToast()

  const handleSelectContact = (contactId: number, checked: boolean) => {
    if (checked) {
      setSelectedContacts([...selectedContacts, contactId])
    } else {
      setSelectedContacts(selectedContacts.filter((id) => id !== contactId))
    }
  }

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedContacts(readyToAssign.map((c) => c.id))
    } else {
      setSelectedContacts([])
    }
  }

  const handleCreateCampaign = async () => {
    if (selectedContacts.length === 0) {
      toast({
        title: "No Contacts Selected",
        description: "Please select at least one contact for the campaign.",
        variant: "destructive",
      })
      return
    }

    setIsCreating(true)

    try {
      // Add each selected contact to the campaign
      await Promise.all(selectedContacts.map((contactId) => apiClient.addContactToCampaign(contactId, campaignType)))

      toast({
        title: "Campaign Created",
        description: `Added ${selectedContacts.length} contacts to ${campaignType} campaign.`,
      })

      setSelectedContacts([])
      onRefresh()
    } catch (error) {
      console.error("Failed to create campaign:", error)
      toast({
        title: "Error",
        description: "Failed to create campaign.",
        variant: "destructive",
      })
    } finally {
      setIsCreating(false)
    }
  }

  const selectedContactsData = readyToAssign.filter((c) => selectedContacts.includes(c.id))

  return (
    <div className="space-y-6">
      {/* Campaign Type Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Campaign Type</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={campaignType} onValueChange={(value) => setCampaignType(value as "email" | "linkedin")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="email" className="gap-2">
                <Mail className="h-4 w-4" />
                Email Campaign
              </TabsTrigger>
              <TabsTrigger value="linkedin" className="gap-2">
                <Linkedin className="h-4 w-4" />
                LinkedIn Campaign
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </CardContent>
      </Card>

      {/* Contact Selection */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" />
            Select Contacts ({selectedContacts.length} selected)
          </CardTitle>
          {selectedContacts.length > 0 && (
            <Button onClick={handleCreateCampaign} disabled={isCreating} className="gap-2">
              <Send className="h-4 w-4" />
              {isCreating ? "Creating..." : `Create ${campaignType} Campaign`}
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {readyToAssign.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No enriched contacts available for campaigns.</p>
              <p className="text-sm">Enrich some contacts first to create campaigns.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={selectedContacts.length === readyToAssign.length}
                  onCheckedChange={handleSelectAll}
                />
                <Label className="text-sm font-medium">Select all {readyToAssign.length} contacts</Label>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12"></TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Message Preview</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {readyToAssign.map((contact) => (
                    <TableRow key={contact.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedContacts.includes(contact.id)}
                          onCheckedChange={(checked) => handleSelectContact(contact.id, checked as boolean)}
                        />
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{contact.name}</div>
                          {contact.title && <div className="text-sm text-muted-foreground">{contact.title}</div>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">{contact.company_name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {contact.email ? (
                          <div className="flex items-center gap-2">
                            <Mail className="h-4 w-4 text-green-600" />
                            <span className="text-sm">{contact.email}</span>
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">No email</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {contact.outreach_message?.subject_line ? (
                          <div className="max-w-xs">
                            <div className="text-sm font-medium truncate">{contact.outreach_message.subject_line}</div>
                            <div className="text-xs text-muted-foreground truncate">
                              {contact.outreach_message.email_body?.substring(0, 100)}...
                            </div>
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">No message</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Selected Contacts Summary */}
      {selectedContacts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Campaign Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Campaign Type:</span>
                <Badge className="gap-2">
                  {campaignType === "email" ? <Mail className="h-3 w-3" /> : <Linkedin className="h-3 w-3" />}
                  {campaignType === "email" ? "Email" : "LinkedIn"}
                </Badge>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Selected Contacts:</span>
                <span className="text-sm">{selectedContacts.length}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Companies Represented:</span>
                <span className="text-sm">{new Set(selectedContactsData.map((c) => c.company_name)).size}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Contacts with Email:</span>
                <span className="text-sm">{selectedContactsData.filter((c) => c.email).length}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Contacts with Messages:</span>
                <span className="text-sm">
                  {selectedContactsData.filter((c) => c.outreach_message?.subject_line).length}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
