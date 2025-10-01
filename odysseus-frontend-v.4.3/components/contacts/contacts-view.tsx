"use client"

import { useState } from "react"
import type { Contact, Company } from "@/lib/types"
import { ContactsTable } from "./contacts-table"
import { ContactFilters } from "./contact-filters"
import { ContactDetailModal } from "./contact-detail-modal"
import { EnrichmentWorkflow } from "./enrichment-workflow"
import { Button } from "@/components/ui/button"
import { Filter, Users } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { apiClient } from "@/lib/api"

interface ContactsViewProps {
  contacts: Contact[]
  companies: Company[]
  loading: boolean
  onRefresh: () => void
}

const defaultFilters = {
  search: "",
  status: [],
  campaignStatus: [],
  companyName: [],
}

export function ContactsView({ contacts, companies, loading, onRefresh }: ContactsViewProps) {
  const [filters, setFilters] = useState(defaultFilters)
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [selectedContacts, setSelectedContacts] = useState<number[]>([])
  const { toast } = useToast()

  // Filter contacts based on current filters
  const filteredContacts = contacts.filter((contact) => {
    // Search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase()
      const matchesSearch =
        contact.name.toLowerCase().includes(searchLower) ||
        contact.email?.toLowerCase().includes(searchLower) ||
        contact.company_name?.toLowerCase().includes(searchLower) ||
        contact.title?.toLowerCase().includes(searchLower)
      if (!matchesSearch) return false
    }

    // Status filter
    if (filters.status.length > 0 && !filters.status.includes(contact.status)) {
      return false
    }

    // Campaign status filter
    if (filters.campaignStatus.length > 0) {
      const campaignStatus = contact.campaign_status || "Ready to Assign"
      if (!filters.campaignStatus.includes(campaignStatus)) {
        return false
      }
    }

    // Company name filter
    if (filters.companyName.length > 0) {
      if (!contact.company_name || !filters.companyName.includes(contact.company_name)) {
        return false
      }
    }

    return true
  })

  const handleEnrichContact = async (contactId: number) => {
    try {
      await apiClient.approveContact(contactId)
      toast({
        title: "Enrichment Started",
        description: "Contact enrichment process has been started.",
      })
      onRefresh()
    } catch (error) {
      console.error("Failed to enrich contact:", error)
      toast({
        title: "Error",
        description: "Failed to start contact enrichment.",
        variant: "destructive",
      })
    }
  }

  const handleBulkEnrich = async (contactIds: number[]) => {
    try {
      await Promise.all(contactIds.map((id) => apiClient.approveContact(id)))
      toast({
        title: "Bulk Enrichment Started",
        description: `Started enrichment for ${contactIds.length} contacts.`,
      })
      setSelectedContacts([])
      onRefresh()
    } catch (error) {
      console.error("Failed to bulk enrich contacts:", error)
      toast({
        title: "Error",
        description: "Failed to start bulk enrichment.",
        variant: "destructive",
      })
    }
  }

  const handleAddToCampaign = async (contactId: number, campaignType: "email" | "linkedin") => {
    try {
      await apiClient.addContactToCampaign(contactId, campaignType)
      toast({
        title: "Added to Campaign",
        description: `Contact added to ${campaignType} campaign.`,
      })
      setSelectedContact(null)
      onRefresh()
    } catch (error) {
      console.error("Failed to add to campaign:", error)
      toast({
        title: "Error",
        description: "Failed to add contact to campaign.",
        variant: "destructive",
      })
    }
  }

  const handleUpdateMessage = async (contactId: number, subjectLine: string, emailBody: string) => {
    try {
      await apiClient.updateContactMessage(contactId, subjectLine, emailBody)
      toast({
        title: "Message Updated",
        description: "Outreach message has been updated.",
      })
      onRefresh()
    } catch (error) {
      console.error("Failed to update message:", error)
      toast({
        title: "Error",
        description: "Failed to update message.",
        variant: "destructive",
      })
    }
  }

  // Get contacts that need enrichment
  const sourcedContacts = companies
    .filter((c) => c.status === "Approved")
    .map((company) => {
      // This would normally come from a separate API call to get contacts for each company
      // For now, we'll simulate this based on the contact data we have
      return {
        company,
        contactCount: contacts.filter((c) => c.company_id === company.id && c.status === "Sourced").length,
      }
    })
    .filter((item) => item.contactCount > 0)

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="h-6 w-6 text-primary" />
          <div>
            <h3 className="text-lg font-medium">Contact Management</h3>
            <p className="text-sm text-muted-foreground">
              {filteredContacts.length} of {contacts.length} contacts
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowFilters(!showFilters)} className="gap-2">
            <Filter className="h-4 w-4" />
            Filters
          </Button>
        </div>
      </div>

      {/* Enrichment Workflow */}
      {sourcedContacts.length > 0 && (
        <EnrichmentWorkflow
          sourcedContacts={sourcedContacts}
          onEnrichContact={handleEnrichContact}
          onBulkEnrich={handleBulkEnrich}
        />
      )}

      {/* Filters */}
      {showFilters && <ContactFilters filters={filters} onFiltersChange={setFilters} contacts={contacts} />}

      {/* Contacts Table */}
      <ContactsTable
        contacts={filteredContacts}
        loading={loading}
        selectedContacts={selectedContacts}
        onSelectedContactsChange={setSelectedContacts}
        onContactClick={setSelectedContact}
        onEnrichContact={handleEnrichContact}
        onBulkEnrich={handleBulkEnrich}
      />

      {/* Contact Detail Modal */}
      {selectedContact && (
        <ContactDetailModal
          contact={selectedContact}
          open={!!selectedContact}
          onOpenChange={(open) => !open && setSelectedContact(null)}
          onAddToCampaign={handleAddToCampaign}
          onUpdateMessage={handleUpdateMessage}
        />
      )}
    </div>
  )
}
