import os
import json
import urllib.parse
import concurrent.futures
from fastapi import FastAPI, HTTPException, Depends, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, FileResponse
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Tuple
from dotenv import load_dotenv
from enum import Enum
from supabase import Client
import requests

from langchain_google_genai import ChatGoogleGenerativeAI

load_dotenv()

import people
from utils import get_supabase, fetch_and_parse_url, get_current_user, brightdata_search

# --- Pydantic Models ---
class Status(str, Enum):
    NEW = "New"; VETTING = "Vetting"; VETTED = "Vetted"; APPROVED = "Approved"; FAILED = "Failed"; REJECTED = "Rejected"

class Source(BaseModel):
    name: Optional[str] = None; url: Optional[str] = None; snippet: Optional[str] = None

class BaseCompany(BaseModel):
    id: int; name: Optional[str] = None; domain: str; status: Status; apollo_data: Optional[Dict] = None; website_url: Optional[str] = None; company_linkedin_url: Optional[str] = None

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
class VetCompaniesRequest(BaseModel):
    company_ids: List[int]
class DeleteCompaniesRequest(BaseModel):
    company_ids: List[int]

# --- Analysis Models ---
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

# --- External API Functions ---
def get_apollo_enrichment(domain: str) -> Optional[dict]:
    apollo_api_key = os.getenv("APOLLO_API_KEY")
    if not apollo_api_key: raise HTTPException(500, "APOLLO_API_KEY not found")
    try:
        response = requests.get("https://api.apollo.io/v1/organizations/enrich", headers={"X-Api-Key": apollo_api_key, 'Content-Type': 'application/json'}, params={"domain": domain}, timeout=15)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"Apollo API error for domain {domain}: {e}")
        return None

def run_vetting_task(company_ids: List[int], supabase: Client):
    """
    This function will be run in the background.
    It iterates through companies one by one to keep memory low.
    """
    print(f"Background task started: Vetting {len(company_ids)} companies.")
    vetted_count = 0
    for company_id in company_ids:
        try:
            # We need to fetch the company data again inside the task
            company_res = supabase.table('companies').select('*').eq('id', company_id).single().execute()
            if company_res.data:
                result = vet_single_company(company_res.data, supabase)
                if result:
                    vetted_count += 1
        except Exception as e:
            print(f"Error vetting company ID {company_id} in background task: {e}")
    print(f"Background task finished: Successfully vetted {vetted_count} companies.")


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

# --- Vetting Logic ---
def conduct_targeted_research(queries: List[str]) -> tuple[str, List[Dict]]:
    topic_sources = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(queries)) as executor:
        future_to_query = {executor.submit(brightdata_search, query): query for query in queries}
        for future in concurrent.futures.as_completed(future_to_query):
            try:
                topic_sources.extend(future.result())
            except Exception as e:
                print(f"A search query failed: {e}")

    unique_sources = list({s.get('url'): s for s in topic_sources if s.get('url')}.values())
    
    transcript = "### Search Results Summary\n"
    for source in unique_sources:
        transcript += f"- Title: {source.get('name')}\n  URL: {source.get('url')}\n  Snippet: {source.get('snippet')}\n"
    
    transcript += "\n### Full Text of Top Articles\n"
    
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        future_to_url = {executor.submit(fetch_and_parse_url, source['url']): source for source in unique_sources[:5]}
        for future in concurrent.futures.as_completed(future_to_url):
            source = future_to_url[future]
            try:
                content = future.result()
                transcript += f"---\nSource URL: {source.get('url')}\nContent: {content}\n---\n\n"
            except Exception as e:
                print(f"Failed to fetch/parse URL {source.get('url')}: {e}")
                transcript += f"---\nSource URL: {source.get('url')}\nContent: FAILED TO FETCH ({e})\n---\n\n"

    return transcript, unique_sources

def get_gemini_vetting(company_data: dict) -> dict:
    gemini_api_key = os.getenv("GEMINI_API_KEY")
    if not gemini_api_key: raise HTTPException(status_code=500, detail="GEMINI_API_KEY not found")

    company_name = company_data.get("organization", {}).get("name", "Unknown Company")
    dossier = company_data.get("organization", {})
    
    print(f"🕵️ Initializing multi-agent research for {company_name}...")
    research_topics = {
        "geography": [ f"'{company_name}' assets operations Ukraine", f"'{company_name}' oil and gas projects Africa", f"'{company_name}' energy investments South America", f"'{company_name}' Black Sea or Eastern Europe operations"],
        "industry": [ f"'{company_name}' upstream oil and gas assets", f"'{company_name}' E&P (exploration and production) activities", f"'{company_name}' investment portfolio focus energy", f"'{company_name}' renewable energy transition strategy"],
        "russia": [ f"'{company_name}' russia involvement", f"'{company_name}' statement on Russian operations after February 2022", f"'{company_name}' russia sanctions", f"'{company_name}' russia assets"],
        "size": [ f"'{company_name}' number of employees", f"'{company_name}' revenue", f"'{company_name}' market size"]
    }
    llm_args = {"model": "gemini-2.5-flash", "google_api_key": gemini_api_key, "temperature": 0.2}
    
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(research_topics)) as executor:
        future_to_topic = {executor.submit(conduct_targeted_research, queries): topic for topic, queries in research_topics.items()}
        topic_results = {future_to_topic[future]: future.result() for future in concurrent.futures.as_completed(future_to_topic)}

    prompts = {
        "geography": (GeographyAnalysis, f"""
    You are a geopolitical risk analyst. Your task is to analyze the company's geographical footprint based on the provided research. **You must completely disregard any information related to Russia for this analysis.** . If irrelevant information on other companies and topics is present, ignore it. your goal is to analyze the company **{company_name}**, thats all.
    - **Scoring Rubric (0-10):**
      - **10:** Active, direct investments or assets in Ukraine. 
      - **9:** Past or minority investments in Ukraine, or indirect supply-chain reliance.
      - **8:** Investments specifically in countries bordering Ukraine (Poland, Slovakia, Hungary, Moldova).
      - **7:** Exposure in Central/Eastern Europe closer to Ukraine (e.g., Romania, Baltics, Balkans).
      - **6:** Substantial portfolio in high-risk/frontier markets (MENA, Sub-Saharan Africa, South Asia).
      - **5:** Active business in Middle East / North Africa (e.g., Egypt, Israel, Iraq, Nigeria).
      - **4:** Moderate emerging market exposure (e.g., Turkey, Mexico, Brazil, South Africa).
      - **3:** Exposure across multiple stable European countries (Western & Southern).
      - **2:** Investments in major Western European economies only (Germany, France, UK, Nordics).
      - **1:** Very safe global footprint with minor exposure to stable Asia-Pacific or Latin American countries.
      - **0:** Ultra-safe investments only in highly stable, distant countries (e.g., Canada, US, Australia, NZ, Japan).
    - **Output:** You MUST respond with a valid JSON object containing `geography_score` and `geography_reasoning`. Cite URLs from the transcript in your reasoning.
    """),
        "industry": (IndustryAnalysis, f"""
    You are a seasoned partnership consultant and analyst with deep expertise in the upstream oil and gas sector.
    Evaluate how well the company aligns with our primary investment thesis using the following scoring rubric. If irrelevant information on other companies and topics is present, ignore it. your goal is to analyze the company **{company_name}**, thats all.
    - **Scoring Rubric (0-10):**
      - **10:** (Profile A) Owners of operational and producing oil fields. OR (Profile B) Opportunistic/risk-seeking capital (hedge funds, PE, sovereign wealth funds known for high-risk/high-return investments).
      - **9:** Operational and producing gas fields. Relevant but secondary to oil.
      - **8:** Exploration/development of oil fields (non-producing or not yet producing).
      - **7:** Exploration/development of natural gas fields (non-producing).
      - **6:** Midstream operators (pipelines, terminals, storage).
      - **5:** Downstream operators (refineries, petrochemicals, retail).
      - **4:** Energy trading houses with hydrocarbon exposure.
      - **3:** Renewables & Utilities (wind, solar, grids).
      - **2:** Energy service firms (EPC, oilfield services, equipment suppliers).
      - **1:** Diversified investors with no active energy involvement (e.g., family offices, conglomerates).
      - **0:** No alignment (consumer, retail, software, finance-only).
    - **Output:** You MUST respond with a valid JSON object containing `industry_score` and `industry_reasoning`. Cite URLs from the transcript in your reasoning.
    """),
        "russia": (RussiaAnalysis, f"""
    You are a compliance officer specializing in international sanctions against Russia.
    Assess the company's ties to Russia using the detailed scoring rubric below, distinguishing between pre- and post-February 2022 activities. If irrelevant information on other companies and topics is present, ignore it. your goal is to analyze the company **{company_name}**, thats all.
    - **Scoring Rubric (0-10):**
      - **10:** No ties. Never operated, invested, or licensed in Russia.
      - **9:** Historic ties, but fully exited *before* Feb 24, 2022.
      - **8:** Immediate 2022 exit. Announced and executed full exit by March 31, 2022.
      - **7:** Prompt 2022 exit. Completed by June 30, 2022.
      - **6:** Late 2022 exit. Completed in the second half of 2022 (July–Dec).
      - **5:** 2023 exit. Suspended in 2022, but full exit not completed until 2023.
      - **4:** Late exit / still winding down. Exit process ongoing into 2023-2025.
      - **3:** Partial presence continues. No full exit; franchises, licensing, or JVs remain.
      - **2:** Substantial ongoing presence. Significant business continues, no commitment to a full exit.
      - **1:** Major ongoing presence. Russia remains a key market or asset hub.
      - **0:** Fully embedded. Russian state-owned, based, or actively expanding post-2022.
    - **Output:** You MUST respond with a valid JSON object containing `russia_score` and `russia_reasoning`. Cite URLs from the transcript in your reasoning.
    """),
        "size": (SizeAnalysis, f"""
    You are an analyst sourcing mid-sized companies for potential partnerships.
    Evaluate the company's size based on employee count and revenue from the dossier and research. If irrelevant information on other companies and topics is present, ignore it. your goal is to analyze the company **{company_name}**, thats all.
    - **Scoring (0-10):** 10 for an ideal mid-market size (50-5000 employees). Score lower for companies that are too small (<10) or too large (>10,000), however a large company is still better than a very small one. a large corporation with 25 thousand should get a 1-2. Also take revenue into account, for example 50 employees but large revenue for their size is a score improvement.
    - **Output:** You MUST respond with a valid JSON object containing `size_score` and `size_reasoning`. Cite URLs from the transcript in your reasoning.
    """)
    }

    all_results = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(prompts)) as executor:
        future_to_topic = {}
        for topic, (model, prompt_template) in prompts.items():
            llm = ChatGoogleGenerativeAI(**llm_args).with_structured_output(model)
            transcript, _ = topic_results[topic]
            prompt = f"{prompt_template}\n\n**Company Name:** {company_name}\n**Research Transcript:**\n{transcript}"
            if topic == 'size': prompt += f"\n**Dossier:** {json.dumps(dossier)}"
            future_to_topic[executor.submit(llm.invoke, prompt)] = topic
        
        for future in concurrent.futures.as_completed(future_to_topic):
            topic = future_to_topic[future]
            try:
                all_results[topic] = future.result()
            except Exception as e:
                print(f"Error processing LLM for topic {topic}: {e}")
                raise HTTPException(status_code=500, detail=f"LLM analysis failed for topic: {topic}")

    print("✍️ Synthesizing final analysis...")
    final_llm = ChatGoogleGenerativeAI(**llm_args).with_structured_output(FinalAnalysis)
    final_prompt = f"""
    You are a senior analyst synthesizing research for a Ukrainian upstream oil and gas asset management firm. Your sole focus is to find potential PARTNERS, not investments.
    Based ONLY on the provided research transcript and dossier for **{company_name}**, generate a final, holistic profile.

    **Primary Investment Thesis:** We are looking for partners who are EITHER **investment firms, funds or offices with primary portfolio of upstream oil and gas sector** OR **operators of upstream oil and gas assets**. Our ideal partner is a **mid-sized company (50-5,000 employees)** with a focus on **geopolitically high-risk regions (e.g., Africa, South America, Eastern Europe)**, and has **no ties to Russia**.

    **Instructions for 'investment_reasoning':**
    1.  **Strictly adhere to the provided text.** Do not use outside knowledge. If the text doesn't support a conclusion, state that the information is not available.
    2.  Start your reasoning with "Yes", "No", or "Depends".
    3.  **"No":** Immediately say "No" if the company is a direct competitor (an upstream oil/gas asset manager in Ukraine), or if it is completely irrelevant (e.g., a software or retail company with no energy assets). Also say "No" if it is geographically focused only on safe, developed markets (e.g., North America, Western Europe, Australia).
    4.  **"Depends":** Use "Depends" for companies that meet some but not all criteria (e.g., they are in the right industry but the wrong size, or they are upstream but in a different geography). Explain the nuance clearly.
    5.  **"Yes":** Only say "Yes" if the company is a strong fit across the majority of the criteria (Upstream Oil & Gas, Mid-Sized, High-Risk Geographies, No Russia Ties).

    **Company Name:** {company_name}
    **Dossier:** {json.dumps(dossier)}

    --- RESEARCH TRANSCRIPTS (Use ONLY this information) ---
    Geography Research:
    {topic_results['geography'][0]}

    Industry Research:
    {topic_results['industry'][0]}

    Russia Ties Research:
    {topic_results['russia'][0]}

    Size Research:
    {topic_results['size'][0]}
    --- END RESEARCH ---
    """
    final_analysis = final_llm.invoke(final_prompt)

    final_results = {}
    for topic, analysis_model in all_results.items():
        final_results.update(analysis_model.dict())
    final_results.update(final_analysis.dict())
    
    final_results['geography_sources'] = topic_results['geography'][1]
    final_results['industry_sources'] = topic_results['industry'][1]
    final_results['russia_sources'] = topic_results['russia'][1]
    final_results['size_sources'] = topic_results['size'][1]

    weights = {'geography': 0.33, 'industry': 0.33, 'russia': 0.166, 'size': 0.166}
    unified_score = sum(final_results.get(f'{topic}_score', 0) * weight for topic, weight in weights.items())
    final_results['unified_score'] = round(unified_score, 2)
    
    print(f"🎉 Vetting Complete for {company_name}!")
    return final_results


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
        domains_to_add = [{'domain': d.strip(), 'status': 'New'} for d in req.domains if d.strip() and d.strip() not in existing_domains]
        skipped_domains = [d for d in req.domains if d.strip() in existing_domains]
        
        added_count = 0
        if domains_to_add:
            insert_response = supabase.table('companies').insert(domains_to_add).execute()
            added_count = len(insert_response.data)
        
        return {"message": "Processed domains.", "added_count": added_count, "skipped_domains": skipped_domains}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to add companies: {str(e)}")


def vet_single_company(company: Dict, supabase: Client) -> Optional[Dict]:
    try:
        supabase.table('companies').update({'status': Status.VETTING}).eq('id', company['id']).execute()
        apollo_data = get_apollo_enrichment(company['domain'])
        
        if not apollo_data or not apollo_data.get("organization"): 
            raise Exception("Apollo enrichment failed or returned no organization data.")
        
        vetting_results = get_gemini_vetting(apollo_data)
        org_data = apollo_data.get("organization", {})
        update_data = {
            "name": org_data.get("name", company['domain']), 
            "status": Status.VETTED, 
            "apollo_data": apollo_data, 
            "website_url": org_data.get("website_url"), 
            "company_linkedin_url": org_data.get("linkedin_url"), 
            **vetting_results
        }
        update_response = supabase.table('companies').update(update_data).eq('id', company['id']).execute()
        return update_response.data[0] if update_response.data else None
    except Exception as e:
        print(f"Failed to vet {company['domain']}: {e}")
        supabase.table('companies').update({'status': Status.FAILED}).eq('id', company['id']).execute()
        return None

@app.post("/companies/vet", status_code=202, dependencies=[Depends(get_current_user)])
def vet_new_companies(req: VetCompaniesRequest, background_tasks: BackgroundTasks, supabase: Client = Depends(get_supabase)):
    # FIX: Add the .in_('id', req.company_ids) filter here
    background_tasks.add_task(run_vetting_task, req.company_ids, supabase)
    return {"message": f"Accepted: Vetting process for {len(req.company_ids)} companies has been started in the background."}

@app.post("/companies/{company_id}/approve", response_model=VettedCompany, dependencies=[Depends(get_current_user)])
def approve_company(company_id: int, supabase: Client = Depends(get_supabase)):
    company_res = supabase.table('companies').select('*').eq('id', company_id).eq('status', 'Vetted').maybe_single().execute()
    if not company_res.data: raise HTTPException(404, "Vetted company not found.")
    
    supabase.table('companies').update({'status': Status.APPROVED}).eq('id', company_id).execute()
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
        supabase.table('companies').update({'status': Status.VETTED}).eq('id', company_id).execute()
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

    update_res = supabase.table('companies').update({'status': Status.REJECTED}).eq('id', company_id).execute()
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