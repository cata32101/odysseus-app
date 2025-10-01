export type Status = "New" | "Vetting" | "Vetted" | "Approved" | "Failed" | "Rejected"

export interface Source {
  name?: string
  url?: string
  snippet?: string
}

export interface Company {
  id: number
  name?: string
  domain: string
  status: Status
  apollo_data?: any
  website_url?: string
  company_linkedin_url?: string
  group_name?: string
  unified_score?: number
  geography_score?: number
  geography_reasoning?: string
  geography_sources?: Source[]
  industry_score?: number
  industry_reasoning?: string
  industry_sources?: Source[]
  russia_score?: number
  russia_reasoning?: string
  russia_sources?: Source[]
  size_score?: number
  size_reasoning?: string
  size_sources?: Source[]
  investment_reasoning?: string
  business_summary?: string
  investments_summary?: string
  company_size?: string
  russia_ties?: string
  ukraine_ties_analysis?: string
  high_risk_regions_analysis?: string
  created_at?: string
}

export interface Contact {
  id: number
  company_id: number
  name: string
  title?: string
  email?: string
  linkedin_url?: string
  status: string
  campaign_status?: string
  campaign_type?: string
  apollo_person_data?: any
  russia_ties_analysis?: any
  outreach_message?: any
  company_name?: string
  created_at?: string
}

export interface PastCampaign {
  id: number
  name: string
  campaign_type: string
  archived_at: string
  contacts_count: number
}

export interface PastCampaignContact {
  id: number
  past_campaign_id: number
  contact_data: Contact
}
