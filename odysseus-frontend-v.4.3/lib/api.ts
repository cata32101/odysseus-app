// lib/api.ts
import type { Company, Contact, PastCampaign, PastCampaignContact } from "./types"

const API_BASE_URL =
  process.env.NODE_ENV === "development" ? "http://localhost:8000" : process.env.NEXT_PUBLIC_API_URL || ""

export class ApiClient {
  private baseUrl: string
  private token: string | null = null

  constructor() {
    this.baseUrl = API_BASE_URL
  }

  setToken(token: string) {
    this.token = token
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`
    const headers: HeadersInit = {
      "Content-Type": "application/json",
      ...options.headers,
    }

    if (this.token) {
      (headers as Record<string, string>).Authorization = `Bearer ${this.token}`
    }

    const response = await fetch(url, {
      ...options,
      headers,
    })

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ detail: response.statusText }));
      throw new Error(`API Error: ${response.status} ${errorBody.detail || response.statusText}`);
    }
    
    // Handle PDF downloads
    if (response.headers.get("Content-Type")?.includes("application/pdf")) {
        return response.blob() as Promise<T>;
    }

    return response.json()
  }

  // --- Company endpoints ---
async getCompanies(
    page: number = 1,
    limit: number = 10,
    filters: any
  ): Promise<{ data: Company[]; count: number }> {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      search: filters.search || "",
    });

    if (filters.status) {
      filters.status.forEach((s: string) => params.append("status", s));
    }
    if (filters.group) {
      filters.group.forEach((g: string) => params.append("group", g));
    }

    const url = `${this.baseUrl}/companies?${params.toString()}`;
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };
    if (this.token) {
      (headers as Record<string, string>).Authorization = `Bearer ${this.token}`;
    }

    const response = await fetch(url, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ detail: response.statusText }));
      throw new Error(`API Error: ${response.status} ${errorBody.detail || response.statusText}`);
    }

    const countHeader = response.headers.get('content-range');
    const count = countHeader ? parseInt(countHeader.split('/')[1], 10) : 0;
    const data = await response.json();

    return { data, count };
  }
  
  async addCompanies(domains: string[], groupName?: string): Promise<{ added_count: number; skipped_domains: string[] }> {
    return this.request("/companies/add", {
      method: "POST",
      body: JSON.stringify({ domains, group_name: groupName }),
    })
  }

  async vetCompanies(companyIds: number[]): Promise<{ message: string }> {
    return this.request("/companies/vet", {
      method: "POST",
      body: JSON.stringify({ company_ids: companyIds }),
    })
  }

  async approveCompany(companyId: number): Promise<Company> {
    return this.request(`/companies/${companyId}/approve`, {
      method: "POST",
    })
  }

  async rejectCompany(companyId: number): Promise<Company> {
    return this.request(`/companies/${companyId}/reject`, {
      method: "POST",
    })
  }

  async deleteCompanies(companyIds: number[]): Promise<{ message: string }> {
    return this.request("/companies/delete-selected", {
      method: "POST",
      body: JSON.stringify({ company_ids: companyIds }),
    })
  }
  
  async getCompanyContacts(companyId: number): Promise<Contact[]> {
      return this.request(`/companies/${companyId}/contacts`)
  }

  async downloadCompanyPDF(companyId: number): Promise<Blob> {
    // This endpoint doesn't exist yet on the backend, but we can add the client method for it
    return this.request(`/companies/${companyId}/pdf`)
  }

  // --- Contact endpoints ---
  async getContacts(): Promise<Contact[]> {
    return this.request("/contacts")
  }

  async approveContact(contactId: number): Promise<Contact> {
    return this.request(`/contacts/${contactId}/approve`, {
      method: "POST",
    })
  }
  
  async enrichContact(contactId: number): Promise<Contact> {
      return this.approveContact(contactId);
  }

  async addContactToCampaign(contactId: number, campaignType: "email" | "linkedin"): Promise<Contact> {
    return this.request(`/contacts/${contactId}/campaign`, {
      method: "POST",
      body: JSON.stringify({ campaign_type: campaignType }),
    })
  }

  async updateContactMessage(contactId: number, subjectLine: string, emailBody: string): Promise<Contact> {
    return this.request(`/contacts/${contactId}/message`, {
      method: "PUT",
      body: JSON.stringify({ subject_line: subjectLine, email_body: emailBody }),
    })
  }

  async archiveCampaign(campaignType: "email" | "linkedin", campaignName: string): Promise<{ message: string }> {
    return this.request("/contacts/campaigns/archive", {
      method: "POST",
      body: JSON.stringify({ campaign_type: campaignType, campaign_name: campaignName }),
    })
  }

  async getPastCampaigns(): Promise<PastCampaign[]> {
    return this.request("/contacts/campaigns/past")
  }

  async getPastCampaignDetails(campaignId: number): Promise<PastCampaignContact[]> {
    return this.request(`/contacts/campaigns/past/${campaignId}`)
  }
  
  // --- Config endpoint ---
  async getConfig(): Promise<{ supabase_url: string; supabase_anon_key: string }> {
    return this.request("/config")
  }
}

export const apiClient = new ApiClient()
