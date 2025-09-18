# kvk6/main.py
import os
import json
import requests
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from typing import List, Optional, Dict
from dotenv import load_dotenv
from enum import Enum
from supabase import Client

# Local imports
import people
from utils import get_supabase, get_current_user
from tasks import run_vetting_task # Import the Celery task

load_dotenv()

# --- Pydantic Models (No changes needed here) ---
class Status(str, Enum):
    NEW = "New"; VETTING = "Vetting"; VETTED = "Vetted"; APPROVED = "Approved"; FAILED = "Failed"; REJECTED = "Rejected"

class Source(BaseModel):
    name: Optional[str] = None; url: Optional[str] = None; snippet: Optional[str] = None

class BaseCompany(BaseModel):
    id: int
    name: Optional[str] = None
    domain: str
    status: Status
    apollo_data: Optional[Dict] = None
    website_url: Optional[str] = None
    company_linkedin_url: Optional[str] = None
    group_name: Optional[str] = None

class VettedCompany(BaseCompany):
    unified_score: Optional[float] = None
    geography_score: Optional[int] = None
    geography_reasoning: Optional[str] = None
    geography_sources: Optional[List[Source]] = None
    industry_score: Optional[int] = None
    industry_reasoning: Optional[str] = None
    industry_sources: Optional[List[Source]] = None
    russia_score: Optional[int] = None
    russia_reasoning: Optional[str] = None
    russia_sources: Optional[List[Source]] = None
    size_score: Optional[int] = None
    size_reasoning: Optional[str] = None
    size_sources: Optional[List[Source]] = None
    investment_reasoning: Optional[str] = None
    business_summary: Optional[str] = None
    investments_summary: Optional[str] = None
    company_size: Optional[str] = None
    russia_ties: Optional[str] = None
    ukraine_ties_analysis: Optional[str] = None
    high_risk_regions_analysis: Optional[str] = None

class AddCompaniesRequest(BaseModel):
    domains: List[str]
    group_name: Optional[str] = None
class VetCompaniesRequest(BaseModel):
    company_ids: List[int]
class DeleteCompaniesRequest(BaseModel):
    company_ids: List[int]

class GeographyAnalysis(BaseModel):
    geography_score: int = Field(description="Integer 0-10 based on geopolitical factors.", ge=0, le=10)
    geography_reasoning: str = Field(description="Detailed reasoning for the geography score, citing sources.")

class IndustryAnalysis(BaseModel):
    industry_score: int = Field(description="Integer 0-10 on oil & gas investment fit.", ge=0, le=10)
    industry_reasoning: str = Field(description="Detailed reasoning for the industry score, citing sources.")

class RussiaAnalysis(BaseModel):
    russia_score: int = Field(description="Integer 0-10 for Russia ties (10 = no ties, 0 = significant ties).", ge=0, le=10)
    russia_reasoning: str = Field(description="Detailed reasoning for the Russia ties score, citing sources.")

class SizeAnalysis(BaseModel):
    size_score: int = Field(description="Integer 0-10 for company size (10 = ideal medium size).", ge=0, le=10)
    size_reasoning: str = Field(description="Detailed reasoning for the company size score, citing sources.")

class FinalAnalysis(BaseModel):
    investment_reasoning: str = Field(description="A clear 'Yes' or 'No' on thesis fit, with detailed reasoning.")
    business_summary: str = Field(description="Detailed summary of the company's business model.")
    investments_summary: str = Field(description="Detailed summary of investment focus, especially on oil & gas.")
    company_size: str = Field(description="A string describing the company's size.")
    russia_ties: str = Field(description="Detailed summary of any ties to Russia.")
    ukraine_ties_analysis: str = Field(description="Detailed summary of activities or support related to Ukraine.")
    high_risk_regions_analysis: str = Field(description="Detailed summary of activities in Africa and South America.")

# --- App Initialization ---
app = FastAPI(title="Odysseus API", version="4.0.0 (Production Stable)")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
app.include_router(people.router)

@app.get("/", include_in_schema=False)
async def read_index():
    return FileResponse("index.html")

@app.get("/login", include_in_schema=False)
async def read_login():
    return FileResponse("login.html")

@app.get("/config")
def get_config():
    return {
        "supabase_url": os.getenv("SUPABASE_URL"),
        "supabase_anon_key": os.getenv("SUPABASE_ANON_KEY")
    }

# --- External API Functions (Only those needed by interactive endpoints) ---

def search_apollo_contacts(apollo_organization_id: str) -> List[dict]:
    # This function is called by the interactive 'approve_company' endpoint, so it stays here.
    apollo_api_key = os.getenv("APOLLO_API_KEY")
    if not apollo_api_key: raise HTTPException(500, "APOLLO_API_KEY not found")
    url = "https://api.apollo.io/v1/people/search"
    headers = {'Content-Type': 'application/json', "X-Api-Key": apollo_api_key}
    searches = {"c_level": {"titles": ["C-Level"], "per_page": 3}, "directors": {"titles": ["Director", "Head of"], "per_page": 4}, "managers": {"titles": ["Investment Manager", "Portfolio Manager", "Partner"], "per_page": 3}}
    all_people = {}
    for search_params in searches.values():
        data = {"organization_ids": [apollo_organization_id], "person_titles": search_params["titles"], "per_page": search_params["per_page"]}
        try:
            response = requests.post(url, headers=headers, json=data, timeout=20)
            response.raise_for_status()
            for person in response.json().get('people', []):
                if person.get('id') and person['id'] not in all_people:
                    all_people[person['id']] = person
        except requests.exceptions.RequestException as e:
            print(f"Error searching Apollo contacts: {e}")
    return list(all_people.values())


# --- API Endpoints ---

@app.get("/companies", response_model=List[VettedCompany], dependencies=[Depends(get_current_user)])
def get_all_companies(supabase: Client = Depends(get_supabase)):
    response = supabase.table('companies').select('*').order('id', desc=True).execute()
    return response.data

@app.post("/companies/add", status_code=201, dependencies=[Depends(get_current_user)])
def add_companies(req: AddCompaniesRequest, supabase: Client = Depends(get_supabase)):
    try:
        existing_response = supabase.table('companies').select('domain').in_('domain', req.domains).execute()
        existing_domains = {item['domain'] for item in existing_response.data}
        domains_to_add = [{'domain': d.strip(), 'status': 'New', 'group_name': req.group_name} for d in req.domains if d.strip() and d.strip() not in existing_domains]
        skipped_domains = [d for d in req.domains if d.strip() in existing_domains]
        
        added_count = 0
        if domains_to_add:
            insert_response = supabase.table('companies').insert(domains_to_add).execute()
            added_count = len(insert_response.data)
        
        return {"message": "Processed domains.", "added_count": added_count, "skipped_domains": skipped_domains}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to add companies: {str(e)}")

# !!! --- MODIFIED ENDPOINT --- !!!
@app.post("/companies/vet", status_code=202, dependencies=[Depends(get_current_user)])
def vet_new_companies(req: VetCompaniesRequest):
    # Instead of BackgroundTasks, we call our Celery task.
    # .delay() sends the task to the message broker (Redis).
    run_vetting_task.delay(req.company_ids)
    return {"message": f"Accepted: Vetting process for {len(req.company_ids)} companies has been started in the background."}

@app.post("/companies/{company_id}/approve", response_model=VettedCompany, dependencies=[Depends(get_current_user)])
def approve_company(company_id: int, supabase: Client = Depends(get_supabase)):
    company_res = supabase.table('companies').select('*').eq('id', company_id).eq('status', 'Vetted').maybe_single().execute()
    if not company_res.data: raise HTTPException(404, "Vetted company not found.")
    
    supabase.table('companies').update({'status': Status.APPROVED.value}).eq('id', company_id).execute()
    try:
        apollo_org_id = company_res.data.get("apollo_data", {}).get("organization", {}).get("id")
        if not apollo_org_id: raise HTTPException(400, "Apollo organization ID not found.")
        
        contacts_from_apollo = search_apollo_contacts(apollo_org_id)
        if contacts_from_apollo:
            contacts_to_insert = [
                {'company_id': company_id, 'name': p.get('name'), 'title': p.get('title'), 'linkedin_url': p.get('linkedin_url'), 'status': 'Sourced', 'apollo_person_data': p, 'apollo_person_id': p.get('id')}
                for p in contacts_from_apollo
            ]
            supabase.table('contacts').insert(contacts_to_insert).execute()
    except Exception as e:
        supabase.table('companies').update({'status': Status.VETTED.value}).eq('id', company_id).execute()
        raise HTTPException(500, f"Contact sourcing failed: {e}")

    approved_res = supabase.table('companies').select('*').eq('id', company_id).single().execute()
    return approved_res.data

@app.post("/companies/{company_id}/reject", response_model=VettedCompany, dependencies=[Depends(get_current_user)])
def reject_company(company_id: int, supabase: Client = Depends(get_supabase)):
    company_res = supabase.table('companies').select('status').eq('id', company_id).maybe_single().execute()
    if not company_res.data:
        raise HTTPException(404, "Company not found.")
    
    if company_res.data['status'] == 'Approved':
        raise HTTPException(400, "Cannot reject a company that has already been approved.")

    update_res = supabase.table('companies').update({'status': Status.REJECTED.value}).eq('id', company_id).execute()
    if not update_res.data:
        raise HTTPException(404, "Company not found or could not be updated.")
        
    return update_res.data[0]

@app.post("/companies/clear-new", dependencies=[Depends(get_current_user)])
def clear_new_companies(supabase: Client = Depends(get_supabase)):
    delete_res = supabase.table('companies').delete().eq('status', 'New').execute()
    return {"message": f"{len(delete_res.data)} 'New' companies cleared."}

@app.post("/companies/clear-failed", dependencies=[Depends(get_current_user)])
def clear_failed_companies(supabase: Client = Depends(get_supabase)):
    delete_res = supabase.table('companies').delete().eq('status', 'Failed').execute()
    return {"message": f"{len(delete_res.data)} 'Failed' companies cleared."}

@app.post("/companies/delete-selected", dependencies=[Depends(get_current_user)])
def delete_selected_companies(req: DeleteCompaniesRequest, supabase: Client = Depends(get_supabase)):
    if not req.company_ids:
        raise HTTPException(status_code=400, detail="No company IDs provided")
    
    try:
        supabase.table('contacts').delete().in_('company_id', req.company_ids).execute()
        delete_res = supabase.table('companies').delete().in_('id', req.company_ids).execute()
        return {"message": f"{len(delete_res.data)} companies and their associated contacts were deleted."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An error occurred during deletion: {str(e)}")

@app.get("/companies/{company_id}/contacts", response_model=List, dependencies=[Depends(get_current_user)])
def get_contacts_for_company(company_id: int, supabase: Client = Depends(get_supabase)):
    res = supabase.table('contacts').select('*, companies(name)').eq('company_id', company_id).order('id', desc=True).execute()
    contacts = []
    for row in res.data:
        if row.get('companies'):
            company_name = row.pop('companies')['name']
            row['company_name'] = company_name
        contacts.append(row)
    return contacts