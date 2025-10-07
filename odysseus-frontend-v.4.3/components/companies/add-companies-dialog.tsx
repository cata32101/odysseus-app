"use client"

import type React from "react"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { apiClient } from "@/lib/api"

interface AddCompaniesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function AddCompaniesDialog({ open, onOpenChange, onSuccess }: AddCompaniesDialogProps) {
  const [domains, setDomains] = useState("")
  const [groupName, setGroupName] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const { toast } = useToast()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!domains.trim()) {
      toast({
        title: "Error",
        description: "Please enter at least one domain.",
        variant: "destructive",
      })
      return
    }

    setIsLoading(true)

    try {
      const domainList = domains
        .split("\n")
        .map((d) => d.trim())
        .filter((d) => d.length > 0)

      const CHUNK_SIZE = 100 // Adjust the chunk size as needed
      for (let i = 0; i < domainList.length; i += CHUNK_SIZE) {
        const chunk = domainList.slice(i, i + CHUNK_SIZE)
        const result = await apiClient.addCompanies(chunk, groupName || undefined)

        toast({
          title: `Companies Added (Chunk ${i / CHUNK_SIZE + 1})`,
          description: `Added ${result.added_count} companies. ${
            result.skipped_domains?.length || 0
          } duplicates skipped.`,
        })
      }

      setDomains("")
      setGroupName("")
      onOpenChange(false)
      onSuccess()
    } catch (error) {
      console.error("Failed to add companies:", error)
      toast({
        title: "Error",
        description: "Failed to add companies. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add Companies</DialogTitle>
          <DialogDescription>
            Enter company domains (one per line) to add them to the platform for vetting.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="domains">Company Domains *</Label>
            <Textarea
              id="domains"
              placeholder="example.com&#10;another-company.com&#10;third-company.org"
              value={domains}
              onChange={(e) => setDomains(e.target.value)}
              rows={8}
              required
              className="max-h-64 overflow-y-auto" // Added classes for scrolling
            />
            <p className="text-sm text-muted-foreground">
              Enter one domain per line. Duplicates will be automatically skipped.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="groupName">Group Name (Optional)</Label>
            <Input
              id="groupName"
              placeholder="e.g., Q1 2024 Prospects"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
            />
            <p className="text-sm text-muted-foreground">Organize companies into groups for easier management.</p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adding...
                </>
              ) : (
                "Add Companies"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
