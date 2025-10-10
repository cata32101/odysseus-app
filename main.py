# kvk6/main.py
import os
import requests
from fastapi import FastAPI, HTTPException, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from typing import List, Optional
from dotenv import load_dotenv
from supabase import Client
from datetime import datetime, timedelta, timezone # <-- Add timezone


# Local imports
from people import router as people_router
from utils import get_supabase, get_current_user
from tasks import run_vetting_task
from models import *

load_dotenv()

app = FastAPI(title="Odysseus API", version="4.3.0") # NEW: Version bump

origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://odysseus-frontend.onrender.com",
    os.getenv("FRONTEND_URL") 
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin for origin in origins if origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Range"],
)

app.include_router(people_router)

@app.get("/config")
def get_config():
    return {
        "supabase_url": os.getenv("SUPABASE_URL"),
        "supabase_anon_key": os.getenv("SUPABASE_ANON_KEY")
    }

@app.get("/companies", dependencies=[Depends(get_current_user)])
def get_all_companies(
    supabase: Client = Depends(get_supabase),
    page: int = 1,
    limit: int = 10,
    search: str = "",
    status: List[str] = Query(None),
    group: List[str] = Query(None),
    sort_by: str = 'created_at',
    sort_dir: str = 'desc',
    include_null_scores: bool = False,
    unified_score_min: Optional[float] = Query(None),
    unified_score_max: Optional[float] = Query(None),
    geography_score_min: Optional[int] = Query(None),
    geography_score_max: Optional[int] = Query(None),
    industry_score_min: Optional[int] = Query(None),
    industry_score_max: Optional[int] = Query(None),
    russia_score_min: Optional[int] = Query(None),
    russia_score_max: Optional[int] = Query(None),
    size_score_min: Optional[int] = Query(None),
    size_score_max: Optional[int] = Query(None)
):
    offset = (page - 1) * limit
    is_ascending = sort_dir.lower() == 'asc'
    
    query = supabase.table('companies').select('*', count='exact')

    if search:
        query = query.or_(f"name.ilike.%{search}%,domain.ilike.%{search}%")
    if status:
        query = query.in_('status', status)
    if group:
        if "No Group" in group:
            other_groups = [g for g in group if g != "No Group"]
            or_conditions = ["group_name.is.null"]
            if other_groups:
                formatted_groups = ",".join([f'"{g}"' for g in other_groups])
                or_conditions.append(f"group_name.in.({formatted_groups})")
            query = query.or_(",".join(or_conditions))
        else:
            query = query.in_('group_name', group)

    score_filters = []
    if unified_score_min is not None and unified_score_min > 0: score_filters.append(f"unified_score.gte.{unified_score_min}")
    if unified_score_max is not None and unified_score_max < 10: score_filters.append(f"unified_score.lte.{unified_score_max}")
    if geography_score_min is not None and geography_score_min > 0: score_filters.append(f"geography_score.gte.{geography_score_min}")
    if geography_score_max is not None and geography_score_max < 10: score_filters.append(f"geography_score.lte.{geography_score_max}")
    if industry_score_min is not None and industry_score_min > 0: score_filters.append(f"industry_score.gte.{industry_score_min}")
    if industry_score_max is not None and industry_score_max < 10: score_filters.append(f"industry_score.lte.{industry_score_max}")
    if russia_score_min is not None and russia_score_min > 0: score_filters.append(f"russia_score.gte.{russia_score_min}")
    if russia_score_max is not None and russia_score_max < 10: score_filters.append(f"russia_score.lte.{russia_score_max}")
    if size_score_min is not None and size_score_min > 0: score_filters.append(f"size_score.gte.{size_score_min}")
    if size_score_max is not None and size_score_max < 10: score_filters.append(f"size_score.lte.{size_score_max}")

    is_score_filter_active = bool(score_filters)

    if is_score_filter_active:
        if include_null_scores:
            score_query_part = f"and({','.join(score_filters)})"
            query = query.or_(f"{score_query_part},status.in.(New,Failed,Vetting)")
        else:
            for f in score_filters:
                column, op, value_str = f.split('.', 2)
                value = float(value_str) if 'unified' in column else int(value_str)
                query = getattr(query, op)(column, value)

    query = query.order(sort_by, desc=not is_ascending, nullsfirst=False)
    response = query.range(offset, offset + limit - 1).execute()
    
    count = response.count
    start = offset
    end = start + len(response.data) - 1 if response.data else start
    
    return JSONResponse(
        content=response.data,
        headers={"Content-Range": f"{start}-{end}/{count}"},
    )

@app.get("/companies/stats", dependencies=[Depends(get_current_user)])
def get_company_stats(supabase: Client = Depends(get_supabase)):
    try:
        response = supabase.table('companies').select('id, status, created_at, group_name').execute()
        return JSONResponse(content=response.data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch stats: {str(e)}")

# --- Bulk Actions ---
@app.post("/companies/approve-selected", dependencies=[Depends(get_current_user)])
def approve_selected_companies(req: VetCompaniesRequest, supabase: Client = Depends(get_supabase)):
    res = supabase.table('companies').update({'status': Status.APPROVED.value}).in_('id', req.company_ids).eq('status', 'Vetted').execute()
    return {"message": f"Attempted to approve {len(req.company_ids)} companies. {len(res.data)} were updated."}

@app.post("/companies/reject-selected", dependencies=[Depends(get_current_user)])
def reject_selected_companies(req: VetCompaniesRequest, supabase: Client = Depends(get_supabase)):
    res = supabase.table('companies').update({'status': Status.REJECTED.value}).in_('id', req.company_ids).execute()
    return {"message": f"Attempted to reject {len(req.company_ids)} companies. {len(res.data)} were updated."}

# NEW: This endpoint will handle changing the group for selected companies
@app.post("/companies/change-group", dependencies=[Depends(get_current_user)])
def change_company_group(req: ChangeGroupRequest, supabase: Client = Depends(get_supabase)):
    try:
        res = supabase.table('companies').update({'group_name': req.group_name}).in_('id', req.company_ids).execute()
        return {"message": f"Group for {len(res.data)} companies was changed to '{req.group_name}'."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An error occurred: {str(e)}")

@app.post("/companies/add", status_code=201, dependencies=[Depends(get_current_user)])
def add_companies(req: AddCompaniesRequest, supabase: Client = Depends(get_supabase)):
    try:
        all_domains = list(set([d.strip() for d in req.domains if d.strip()]))
        existing_domains = set()
        batch_size = 20 

        # Batch the check for existing domains
        for i in range(0, len(all_domains), batch_size):
            batch = all_domains[i:i + batch_size]
            if batch:
                response = supabase.table('companies').select('domain').in_('domain', batch).execute()
                for item in response.data:
                    existing_domains.add(item['domain'])
        
        domains_to_add = [{'domain': d, 'status': 'New', 'group_name': req.group_name} for d in all_domains if d not in existing_domains]
        skipped_domains = [d for d in all_domains if d in existing_domains]
        
        added_count = 0
        # Batch the inserts
        for i in range(0, len(domains_to_add), batch_size):
            batch = domains_to_add[i:i + batch_size]
            if batch:
                insert_response = supabase.table('companies').insert(batch).execute()
                added_count += len(insert_response.data)
        
        return {"message": "Processed domains.", "added_count": added_count, "skipped_domains": skipped_domains}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to add companies: {str(e)}")

@app.post("/companies/vet", status_code=202, dependencies=[Depends(get_current_user)])
def vet_new_companies(req: VetCompaniesRequest):
    # NEW: Split large vetting requests into smaller chunks
    chunk_size = 3
    company_ids_chunks = [req.company_ids[i:i + chunk_size] for i in range(0, len(req.company_ids), chunk_size)]
    
    for chunk in company_ids_chunks:
        run_vetting_task.delay(chunk)
        
    return {"message": f"Accepted: Vetting process for {len(req.company_ids)} companies has been started in the background in {len(company_ids_chunks)} chunks."}

@app.post("/companies/reset-stuck-vetting", dependencies=[Depends(get_current_user)])
def reset_stuck_vetting(supabase: Client = Depends(get_supabase)):
    """
    Finds companies that have been in the 'Vetting' state for more than
    1 hour and resets their status to 'New'. This uses 'created_at' for reliability.
    """
    try:
        # Define the threshold as 1 hour ago in a UTC-aware format.
        time_threshold = datetime.now(timezone.utc) - timedelta(hours=1)
        
        # Find companies that are stuck using the 'created_at' column.
        # This is more reliable than 'updated_at'.
        stuck_companies_res = supabase.table('companies').select('id').eq('status', 'Vetting').lt('created_at', time_threshold.isoformat()).execute()
        
        if not stuck_companies_res.data:
            return {"message": "No stuck companies were found."}
            
        stuck_ids = [c['id'] for c in stuck_companies_res.data]
        
        # Reset the status of stuck companies back to 'New'
        reset_res = supabase.table('companies').update({'status': 'New'}).in_('id', stuck_ids).execute()
        
        return {"message": f"Successfully reset {len(reset_res.data)} stuck companies."}
        
    except Exception as e:
        # Provide a more detailed error message if something still goes wrong.
        print(f"Error in reset_stuck_vetting: {e}")
        raise HTTPException(status_code=500, detail=f"An internal error occurred: {str(e)}")

@app.post("/companies/retry-failed", status_code=202, dependencies=[Depends(get_current_user)])
def retry_failed_companies(supabase: Client = Depends(get_supabase)):
    try:
        failed_companies_res = supabase.table('companies').select('id').eq('status', 'Failed').execute()
        if not failed_companies_res.data:
            raise HTTPException(status_code=404, detail="No failed companies found to retry.")

        failed_company_ids = [c['id'] for c in failed_companies_res.data]
        
        # NEW: Also chunk the retry mechanism
        chunk_size = 3
        company_ids_chunks = [failed_company_ids[i:i + chunk_size] for i in range(0, len(failed_company_ids), chunk_size)]

        for chunk in company_ids_chunks:
            run_vetting_task.delay(chunk)
        
        return {"message": f"Vetting process has been re-initiated for {len(failed_company_ids)} failed companies in {len(company_ids_chunks)} chunks."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def search_apollo_contacts(organization_id: str, per_page: int = 8) -> list:
    """
    Searches for people in Apollo.io based on the organization ID and specific job titles.
    """
    apollo_api_key = os.getenv("APOLLO_API_KEY")
    if not apollo_api_key:
        print("APOLLO_API_KEY not found")
        return []

    url = "https://api.apollo.io/v1/mixed_people/search"

    headers = {
        "X-Api-Key": apollo_api_key,
        "Content-Type": "application/json"
    }

    target_titles = [
        "CEO", "CTO", "CFO", "COO", 
        "Investment Manager", 
        "Portfolio Manager", 
        "Head of Oil", 
        "Director of Investments",
        "Managing Director"
    ]

    data = {
        "organization_ids": [organization_id],
        "person_titles": target_titles,
        "sort_by_field": "person_linkedin_uid",
        "sort_ascending": True,
        "per_page": per_page
    }

    try:
        response = requests.post(url, headers=headers, json=data, timeout=30)
        response.raise_for_status()
        return response.json().get("people", [])
    except requests.exceptions.RequestException as e:
        print(f"Apollo API error searching contacts for org {organization_id}: {e}")
        return []

@app.post("/companies/{company_id}/approve", response_model=VettedCompany, dependencies=[Depends(get_current_user)])
def approve_company(company_id: int, supabase: Client = Depends(get_supabase)):
    company_res = supabase.table('companies').select('*').eq('id', company_id).eq('status', 'Vetted').maybe_single().execute()
    if not company_res.data: raise HTTPException(404, "Vetted company not found.")
    
    update_res = supabase.table('companies').update({'status': Status.APPROVED.value}).eq('id', company_id).select().single().execute()
    
    try:
        apollo_org_id = company_res.data.get("apollo_data", {}).get("organization", {}).get("id")
        if not apollo_org_id: 
            print(f"No Apollo Org ID for company {company_id}, skipping contact sourcing.")
            return update_res.data

        contacts_from_apollo = search_apollo_contacts(apollo_org_id)
        if contacts_from_apollo:
            contacts_to_insert = [
                {'company_id': company_id, 'name': p.get('name'), 'title': p.get('title'), 'linkedin_url': p.get('linkedin_url'), 'status': 'Sourced', 'apollo_person_data': p, 'apollo_person_id': p.get('id')}
                for p in contacts_from_apollo
            ]
            supabase.table('contacts').insert(contacts_to_insert).execute()
    except Exception as e:
        # Don't revert the status, just log that contact sourcing failed
        print(f"CRITICAL: Contact sourcing failed for approved company {company_id}: {e}")

    return update_res.data

@app.post("/companies/{company_id}/reject", response_model=VettedCompany, dependencies=[Depends(get_current_user)])
def reject_company(company_id: int, supabase: Client = Depends(get_supabase)):
    company_res = supabase.table('companies').select('status').eq('id', company_id).maybe_single().execute()
    if not company_res.data:
        raise HTTPException(404, "Company not found.")
    
    if company_res.data['status'] not in ['Vetted', 'New']:
        raise HTTPException(400, f"Cannot reject a company with status '{company_res.data['status']}'.")

    update_res = supabase.table('companies').update({'status': Status.REJECTED.value}).eq('id', company_id).select().single().execute()
    if not update_res.data:
        raise HTTPException(404, "Company not found or could not be updated.")
        
    return update_res.data

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
