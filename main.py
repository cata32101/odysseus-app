# kvk6/main.py
import os
import requests
from fastapi import FastAPI, HTTPException, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from typing import List
from dotenv import load_dotenv
from supabase import Client

# Local imports
import people
from utils import get_supabase, get_current_user
from tasks import run_vetting_task  # Import the Celery task
from models import * # Import all models from our new models.py file

load_dotenv()

# --- App Initialization ---
app = FastAPI(title="Odysseus API", version="4.0.0 (Production Stable)")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
app.include_router(people.router)

# --- Static Pages ---
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

# --- External API Functions ---
def search_apollo_contacts(apollo_organization_id: str) -> List[dict]:
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
@app.get("/companies", dependencies=[Depends(get_current_user)])
def get_all_companies(
    supabase: Client = Depends(get_supabase),
    page: int = 1,
    limit: int = 10,
    search: str = "",
    status: List[str] = Query(None),
    group: List[str] = Query(None),
    sort_by: str = 'created_at', # Add sort_by
    sort_dir: str = 'desc'       # Add sort_dir
):
    offset = (page - 1) * limit
    # The PostgREST library uses `asc` or `desc` for ordering.
    is_ascending = sort_dir.lower() == 'asc'

    # Start building the query
    query = supabase.table('companies').select('*', count='exact')

    if search:
        query = query.or_(f"name.ilike.%{search}%,domain.ilike.%{search}%")
    
    if status:
        query = query.in_('status', status)

    if group:
        query = query.in_('group_name', group)

    # Add the sorting and pagination
    response = query.order(sort_by, desc=not is_ascending).range(offset, offset + limit - 1).execute()
    
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

@app.post("/companies/vet", status_code=202, dependencies=[Depends(get_current_user)])
def vet_new_companies(req: VetCompaniesRequest):
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
