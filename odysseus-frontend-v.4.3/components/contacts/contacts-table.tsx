"use client"

import { useState } from "react"
import type { Contact } from "@/lib/types"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { MoreHorizontal, ArrowUpDown, User, Sparkles, Mail, Linkedin } from "lucide-react"

interface ContactsTableProps {
  contacts: Contact[]
  loading: boolean
  selectedContacts: number[]
  onSelectedContactsChange: (ids: number[]) => void
  onContactClick: (contact: Contact) => void
  onEnrichContact: (contactId: number) => void
  onBulkEnrich: (contactIds: number[]) => void
}

type SortField = "name" | "title" | "company_name" | "status" | "campaign_status" | "created_at"
type SortDirection = "asc" | "desc"

const statusColors = {
  Sourced: "bg-blue-100 text-blue-800",
  "Pending Enrichment": "bg-yellow-100 text-yellow-800",
  Enriched: "bg-green-100 text-green-800",
  "Failed Enrichment": "bg-red-100 text-red-800",
}

const campaignStatusColors = {
  "Ready to Assign": "bg-gray-100 text-gray-800",
  "In Campaign": "bg-purple-100 text-purple-800",
}

export function ContactsTable({
  contacts,
  loading,
  selectedContacts,
  onSelectedContactsChange,
  onContactClick,
  onEnrichContact,
  onBulkEnrich,
}: ContactsTableProps) {
  const [sortField, setSortField] = useState<SortField>("created_at")
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc")

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc")
    } else {
      setSortField(field)
      setSortDirection("asc")
    }
  }

  const sortedContacts = [...contacts].sort((a, b) => {
    let aValue: any = a[sortField]
    let bValue: any = b[sortField]

    if (aValue === null || aValue === undefined) aValue = ""
    if (bValue === null || bValue === undefined) bValue = ""

    if (typeof aValue === "string") {
      aValue = aValue.toLowerCase()
      bValue = bValue.toLowerCase()
    }

    if (aValue < bValue) return sortDirection === "asc" ? -1 : 1
    if (aValue > bValue) return sortDirection === "asc" ? 1 : -1
    return 0
  })

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      onSelectedContactsChange(contacts.map((c) => c.id))
    } else {
      onSelectedContactsChange([])
    }
  }

  const handleSelectContact = (contactId: number, checked: boolean) => {
    if (checked) {
      onSelectedContactsChange([...selectedContacts, contactId])
    } else {
      onSelectedContactsChange(selectedContacts.filter((id) => id !== contactId))
    }
  }

  const handleBulkEnrichSelected = () => {
    const sourcedContacts = selectedContacts.filter((id) => {
      const contact = contacts.find((c) => c.id === id)
      return contact?.status === "Sourced"
    })
    if (sourcedContacts.length > 0) {
      onBulkEnrich(sourcedContacts)
    }
  }

  if (loading) {
    return (
      <Card className="p-6">
        <div className="space-y-4">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="flex items-center space-x-4">
              <Skeleton className="h-4 w-4" />
              <Skeleton className="h-4 w-[200px]" />
              <Skeleton className="h-4 w-[150px]" />
              <Skeleton className="h-4 w-[100px]" />
              <Skeleton className="h-4 w-[80px]" />
            </div>
          ))}
        </div>
      </Card>
    )
  }

  const sourcedSelectedCount = selectedContacts.filter((id) => {
    const contact = contacts.find((c) => c.id === id)
    return contact?.status === "Sourced"
  }).length

  return (
    <Card>
      <div className="p-4">
        {selectedContacts.length > 0 && (
          <div className="flex items-center gap-2 mb-4 p-2 bg-muted rounded-md">
            <span className="text-sm font-medium">{selectedContacts.length} selected</span>
            {sourcedSelectedCount > 0 && (
              <Button size="sm" onClick={handleBulkEnrichSelected} className="gap-2">
                <Sparkles className="h-4 w-4" />
                Enrich {sourcedSelectedCount} Contacts
              </Button>
            )}
          </div>
        )}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <Checkbox
                  checked={selectedContacts.length === contacts.length && contacts.length > 0}
                  onCheckedChange={handleSelectAll}
                />
              </TableHead>
              <TableHead>
                <Button variant="ghost" onClick={() => handleSort("name")} className="gap-2 p-0 h-auto font-medium">
                  Contact
                  <ArrowUpDown className="h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  onClick={() => handleSort("company_name")}
                  className="gap-2 p-0 h-auto font-medium"
                >
                  Company
                  <ArrowUpDown className="h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead>
                <Button variant="ghost" onClick={() => handleSort("status")} className="gap-2 p-0 h-auto font-medium">
                  Status
                  <ArrowUpDown className="h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  onClick={() => handleSort("campaign_status")}
                  className="gap-2 p-0 h-auto font-medium"
                >
                  Campaign
                  <ArrowUpDown className="h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead>Contact Info</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedContacts.map((contact) => (
              <TableRow
                key={contact.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => onContactClick(contact)}
              >
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={selectedContacts.includes(contact.id)}
                    onCheckedChange={(checked) => handleSelectContact(contact.id, checked as boolean)}
                  />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="font-medium">{contact.name}</div>
                      {contact.title && <div className="text-sm text-muted-foreground">{contact.title}</div>}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="font-medium">{contact.company_name}</div>
                </TableCell>
                <TableCell>
                  <Badge
                    className={statusColors[contact.status as keyof typeof statusColors] || "bg-gray-100 text-gray-800"}
                  >
                    {contact.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={campaignStatusColors[contact.campaign_status as keyof typeof campaignStatusColors] || ""}
                  >
                    {contact.campaign_status || "Ready to Assign"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2 text-sm">
                    {contact.email && (
                      <div className="flex items-center gap-1">
                        <Mail className="h-3 w-3 text-muted-foreground" />
                        <span className="text-xs">Email</span>
                      </div>
                    )}
                    {contact.linkedin_url && (
                      <div className="flex items-center gap-1">
                        <Linkedin className="h-3 w-3 text-muted-foreground" />
                        <span className="text-xs">LinkedIn</span>
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="h-8 w-8 p-0">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onContactClick(contact)}>
                        <User className="mr-2 h-4 w-4" />
                        View Details
                      </DropdownMenuItem>
                      {contact.status === "Sourced" && (
                        <DropdownMenuItem onClick={() => onEnrichContact(contact.id)}>
                          <Sparkles className="mr-2 h-4 w-4" />
                          Enrich Contact
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {contacts.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            No contacts found. Approve some companies to source contacts.
          </div>
        )}
      </div>
    </Card>
  )
}
