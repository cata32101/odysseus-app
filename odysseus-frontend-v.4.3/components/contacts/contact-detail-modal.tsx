"use client"

import { useState, useEffect } from "react"
import type { Contact } from "@/lib/types"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ExternalLink, User, Building2, Mail, Linkedin, Edit3, Send } from "lucide-react"

interface ContactDetailModalProps {
  contact: Contact
  open: boolean
  onOpenChange: (open: boolean) => void
  onAddToCampaign: (contactId: number, campaignType: "email" | "linkedin") => void
  onUpdateMessage: (contactId: number, subjectLine: string, emailBody: string) => void
}

export function ContactDetailModal({
  contact,
  open,
  onOpenChange,
  onAddToCampaign,
  onUpdateMessage,
}: ContactDetailModalProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")

  useEffect(() => {
    if (contact.outreach_message) {
      setSubject(contact.outreach_message.subject_line || "")
      setBody(contact.outreach_message.email_body || "")
    } else {
      setSubject("")
      setBody("")
    }
    setIsEditing(false)
  }, [contact])

  const handleSaveMessage = () => {
    onUpdateMessage(contact.id, subject, body)
    setIsEditing(false)
  }

  const handleAddToEmailCampaign = () => {
    onAddToCampaign(contact.id, "email")
  }

  const handleAddToLinkedInCampaign = () => {
    onAddToCampaign(contact.id, "linkedin")
  }

  const apolloPerson = contact.apollo_person_data

  const formatDate = (dateString?: string) => {
    if (!dateString) return "N/A"
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <User className="h-6 w-6 text-primary" />
              <div>
                <DialogTitle className="text-xl">{contact.name}</DialogTitle>
                <p className="text-sm text-muted-foreground">{contact.title}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{contact.status}</Badge>
              <Badge>{contact.campaign_status || "Ready to Assign"}</Badge>
            </div>
          </div>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Left Column: Contact Details */}
          <div className="md:col-span-1 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Contact Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{contact.company_name}</span>
                </div>
                {contact.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <a href={`mailto:${contact.email}`} className="text-sm text-primary hover:underline">
                      {contact.email}
                    </a>
                  </div>
                )}
                {contact.linkedin_url && (
                  <div className="flex items-center gap-2">
                    <Linkedin className="h-4 w-4 text-muted-foreground" />
                    <a
                      href={contact.linkedin_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline flex items-center gap-1"
                    >
                      LinkedIn Profile
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}
                <div className="text-xs text-muted-foreground pt-2">Sourced: {formatDate(contact.created_at)}</div>
              </CardContent>
            </Card>

            {apolloPerson && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Apollo Data</CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="text-xs bg-muted p-2 rounded-md overflow-auto max-h-48">
                    {JSON.stringify(apolloPerson, null, 2)}
                  </pre>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right Column: Outreach Message */}
          <div className="md:col-span-2 space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">AI-Generated Outreach Message</CardTitle>
                {!isEditing && (
                  <Button variant="outline" size="sm" onClick={() => setIsEditing(true)} className="gap-2">
                    <Edit3 className="h-4 w-4" />
                    Edit
                  </Button>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                {isEditing ? (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="subject">Subject</Label>
                      <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="body">Body</Label>
                      <Textarea id="body" value={body} onChange={(e) => setBody(e.target.value)} rows={10} />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setIsEditing(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleSaveMessage}>Save</Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium">Subject:</h4>
                      <p className="text-sm text-muted-foreground">{subject || "No subject generated."}</p>
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium">Body:</h4>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{body || "No body generated."}</p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <div className="flex justify-end gap-2">
              <Button onClick={handleAddToLinkedInCampaign} variant="outline" className="gap-2 bg-transparent">
                <Linkedin className="h-4 w-4" />
                Add to LinkedIn Campaign
              </Button>
              <Button onClick={handleAddToEmailCampaign} className="gap-2">
                <Send className="h-4 w-4" />
                Add to Email Campaign
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}