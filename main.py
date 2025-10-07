# kvk6/main.py
import os
import requests
from fastapi import FastAPI, HTTPException, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from typing import List, Optional
from dotenv import load_dotenv
from supabase import Client

# Local imports
from people import router as people_router
from utils import get_supabase, get_current_user
from tasks import run_vetting_task
from models import *

load_dotenv()

app = FastAPI(title="Odysseus API", version="4.1.0")

origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://odysseus-frontend.onrender.com", # Example deployed URL
    os.getenv("FRONTEND_URL") # More flexible for different environments
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

    # Apply base text and status filters
    if search:
        query = query.or_(f"name.ilike.%{search}%,domain.ilike.%{search}%")
    if status:
        query = query.in_('status', status)
    
    # --- Start of Restored Group Filtering Logic ---
    if group:
        if "No Group" in group:
            # Handle cases where "No Group" is selected along with other groups
            other_groups = [g for g in group if g != "No Group"]
            or_conditions = ["group_name.is.null"]
            if other_groups:
                # Ensure correct formatting for the 'in' clause
                formatted_groups = ",".join([f'"{g}"' for g in other_groups])
                or_conditions.append(f"group_name.in.({formatted_groups})")
            query = query.or_(",".join(or_conditions))
        else:
            # Filter by specific groups
            query = query.in_('group_name', group)
    # --- End of Restored Group Filtering Logic ---

    # Score Filtering Logic
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
        # Add group_name to the select query
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
    res = supabase.table('companies').update({'status': Status.REJECTED.value}).in_('id', req.company_ids).eq('status', 'Vetted').execute()
    return {"message": f"Attempted to reject {len(req.company_ids)} companies. {len(res.data)} were updated."}
    
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


@app.post("/companies/retry-failed", status_code=202, dependencies=[Depends(get_current_user)])
def retry_failed_companies(supabase: Client = Depends(get_supabase)):
    try:
        # Get all companies with "Failed" status
        failed_companies_res = supabase.table('companies').select('id').eq('status', 'Failed').execute()
        if not failed_companies_res.data:
            raise HTTPException(status_code=404, detail="No failed companies found to retry.")

        failed_company_ids = [c['id'] for c in failed_companies_res.data]
        
        # Trigger the vetting task for these companies
        run_vetting_task.delay(failed_company_ids)
        
        return {"message": f"Vetting process has been re-initiated for {len(failed_company_ids)} failed companies."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
    
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

