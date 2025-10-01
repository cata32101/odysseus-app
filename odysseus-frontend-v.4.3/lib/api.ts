const API_BASE_URL = process.env.NODE_ENV === "development" ? "/api" : process.env.NEXT_PUBLIC_API_URL || ""

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
      headers.Authorization = `Bearer ${this.token}`
    }

    const response = await fetch(url, {
      ...options,
      headers,
    })

    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`)
    }

    return response.json()
  }

  // Company endpoints
  async getCompanies() {
    return this.request("/companies")
  }

  async addCompanies(domains: string[], groupName?: string) {
    return this.request("/companies/add", {
      method: "POST",
      body: JSON.stringify({ domains, group_name: groupName }),
    })
  }

  async vetCompanies(companyIds: number[]) {
    return this.request("/companies/vet", {
      method: "POST",
      body: JSON.stringify({ company_ids: companyIds }),
    })
  }

  async approveCompany(companyId: number) {
    return this.request(`/companies/${companyId}/approve`, {
      method: "POST",
    })
  }

  async rejectCompany(companyId: number) {
    return this.request(`/companies/${companyId}/reject`, {
      method: "POST",
    })
  }

  async deleteCompanies(companyIds: number[]) {
    return this.request("/companies/delete-selected", {
      method: "POST",
      body: JSON.stringify({ company_ids: companyIds }),
    })
  }

  async moveCompanies(companyIds: number[], groupName: string) {
    return this.request("/companies/move-group", {
      method: "POST",
      body: JSON.stringify({ company_ids: companyIds, group_name: groupName }),
    })
  }

  // Contact endpoints
  async getContacts() {
    return this.request("/contacts")
  }

  async approveContact(contactId: number) {
    return this.request(`/contacts/${contactId}/approve`, {
      method: "POST",
    })
  }

  async addContactToCampaign(contactId: number, campaignType: "email" | "linkedin") {
    return this.request(`/contacts/${contactId}/campaign`, {
      method: "POST",
      body: JSON.stringify({ campaign_type: campaignType }),
    })
  }

  async updateContactMessage(contactId: number, subjectLine: string, emailBody: string) {
    return this.request(`/contacts/${contactId}/message`, {
      method: "PUT",
      body: JSON.stringify({ subject_line: subjectLine, email_body: emailBody }),
    })
  }

  async archiveCampaign(campaignType: "email" | "linkedin", campaignName: string) {
    return this.request("/contacts/campaigns/archive", {
      method: "POST",
      body: JSON.stringify({ campaign_type: campaignType, campaign_name: campaignName }),
    })
  }

  async getPastCampaigns() {
    return this.request("/contacts/campaigns/past")
  }

  async getPastCampaignDetails(campaignId: number) {
    return this.request(`/contacts/campaigns/past/${campaignId}`)
  }

  // Config endpoint
  async getConfig() {
    return this.request("/config")
  }
}

export const apiClient = new ApiClient()
