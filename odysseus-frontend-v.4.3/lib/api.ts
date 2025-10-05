// lib/api.ts
import type { Company, Contact, PastCampaign, PastCampaignContact, CompanyFilters } from "./types"

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

  private async request(endpoint: string, options: RequestInit = {}): Promise<Response> {
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
    
    return response
  }

 // --- Company endpoints ---
 async getCompanies(
  page: number = 1,
  limit: number = 10,
  filters: Partial<CompanyFilters>,
  sortBy: string = 'created_at',
  sortDir: string = 'desc'
): Promise<{ data: Company[]; count: number }> {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    search: filters.search || "",
    sort_by: sortBy,
    sort_dir: sortDir,
  });

  if (filters.status && filters.status.length > 0) {
    filters.status.forEach((s: string) => params.append("status", s));
  }
  if (filters.group && filters.group.length > 0) {
    filters.group.forEach((g: string) => params.append("group", g));
  }

  if (filters.scoreRanges) {
      if (filters.scoreRanges.unified) {
          params.append("unified_score_min", String(filters.scoreRanges.unified[0]));
          params.append("unified_score_max", String(filters.scoreRanges.unified[1]));
      }
      if (filters.scoreRanges.geography) {
          params.append("geography_score_min", String(filters.scoreRanges.geography[0]));
          params.append("geography_score_max", String(filters.scoreRanges.geography[1]));
      }
      if (filters.scoreRanges.industry) {
          params.append("industry_score_min", String(filters.scoreRanges.industry[0]));
          params.append("industry_score_max", String(filters.scoreRanges.industry[1]));
      }
      if (filters.scoreRanges.russia) {
          params.append("russia_score_min", String(filters.scoreRanges.russia[0]));
          params.append("russia_score_max", String(filters.scoreRanges.russia[1]));
      }
      if (filters.scoreRanges.size) {
          params.append("size_score_min", String(filters.scoreRanges.size[0]));
          params.append("size_score_max", String(filters.scoreRanges.size[1]));
      }
  }

  const response = await this.request(`/companies?${params.toString()}`, {
    method: "GET",
  });

  const countHeader = response.headers.get('content-range');
  const count = countHeader ? parseInt(countHeader.split('/')[1], 10) : 0;
  const data = await response.json();

  return { data, count };
}

async getCompaniesForStats(): Promise<Company[]> {
    const response = await this.request(`/companies/stats`);
    return response.json();
}


async addCompanies(domains: string[], groupName?: string): Promise<{ added_count: number; skipped_domains: string[] }> {
  const response = await this.request("/companies/add", {
    method: "POST",
    body: JSON.stringify({ domains, group_name: groupName }),
  });
  return response.json();
}

async vetCompanies(companyIds: number[]): Promise<{ message: string }> {
  const response = await this.request("/companies/vet", {
    method: "POST",
    body: JSON.stringify({ company_ids: companyIds }),
  });
  return response.json();
}

async approveCompany(companyId: number): Promise<Company> {
  const response = await this.request(`/companies/${companyId}/approve`, {
    method: "POST",
  });
  return response.json();
}

async rejectCompany(companyId: number): Promise<Company> {
  const response = await this.request(`/companies/${companyId}/reject`, {
    method: "POST",
  });
  return response.json();
}

async approveCompanies(companyIds: number[]): Promise<{ message: string }> {
    const response = await this.request("/companies/approve-selected", {
      method: "POST",
      body: JSON.stringify({ company_ids: companyIds }),
    });
    return response.json();
}

async rejectCompanies(companyIds: number[]): Promise<{ message: string }> {
    const response = await this.request("/companies/reject-selected", {
        method: "POST",
        body: JSON.stringify({ company_ids: companyIds }),
    });
    return response.json();
}

async deleteCompanies(companyIds: number[]): Promise<{ message: string }> {
  const response = await this.request("/companies/delete-selected", {
    method: "POST",
    body: JSON.stringify({ company_ids: companyIds }),
  });
  return response.json();
}

async getCompanyContacts(companyId: number): Promise<Contact[]> {
    const response = await this.request(`/companies/${companyId}/contacts`);
    return response.json();
}

async downloadCompanyPDF(companyId: number): Promise<Blob> {
  const response = await this.request(`/companies/${companyId}/pdf`);
  return response.blob();
}

// --- Contact endpoints ---
async getContacts(): Promise<Contact[]> {
  const response = await this.request("/contacts");
  return response.json();
}

async approveContact(contactId: number): Promise<Contact> {
  const response = await this.request(`/contacts/${contactId}/approve`, {
    method: "POST",
  });
  return response.json();
}

async enrichContact(contactId: number): Promise<Contact> {
    return this.approveContact(contactId);
}

async addContactToCampaign(contactId: number, campaignType: "email" | "linkedin"): Promise<Contact> {
  const response = await this.request(`/contacts/${contactId}/campaign`, {
    method: "POST",
    body: JSON.stringify({ campaign_type: campaignType }),
  });
  return response.json();
}

async updateContactMessage(contactId: number, subjectLine: string, emailBody: string): Promise<Contact> {
  const response = await this.request(`/contacts/${contactId}/message`, {
    method: "PUT",
    body: JSON.stringify({ subject_line: subjectLine, email_body: emailBody }),
  });
  return response.json();
}

async archiveCampaign(campaignType: "email" | "linkedin", campaignName: string): Promise<{ message: string }> {
  const response = await this.request("/contacts/campaigns/archive", {
    method: "POST",
    body: JSON.stringify({ campaign_type: campaignType, campaign_name: campaignName }),
  });
  return response.json();
}

async getPastCampaigns(): Promise<PastCampaign[]> {
  const response = await this.request("/contacts/campaigns/past");
  return response.json();
}

async getPastCampaignDetails(campaignId: number): Promise<PastCampaignContact[]> {
  const response = await this.request(`/contacts/campaigns/past/${campaignId}`);
  return response.json();
}

// --- Config endpoint ---
async getConfig(): Promise<{ supabase_url: string; supabase_anon_key: string }> {
  const response = await this.request("/config");
  return response.json();
}
}

export const apiClient = new ApiClient();

