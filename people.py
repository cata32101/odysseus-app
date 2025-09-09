import os
import json
import requests
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import List, Optional, Dict
from enum import Enum
from supabase import Client

from langchain_google_genai import ChatGoogleGenerativeAI
from utils import get_supabase, fetch_and_parse_url, brightdata_search

# --- Router & Models ---
router = APIRouter(prefix="/contacts", tags=["Contacts"])

class CampaignType(str, Enum):
    EMAIL = "email"
    LINKEDIN = "linkedin"

class Contact(BaseModel):
    id: int
    company_id: int
    name: str
    title: Optional[str] = None
    email: Optional[str] = None
    # phone field removed
    linkedin_url: Optional[str] = None
    status: str
    campaign_status: Optional[str] = Field(default="Ready to Assign")
    campaign_type: Optional[str] = None
    apollo_person_data: Optional[Dict] = None
    russia_ties_analysis: Optional[Dict] = None
    outreach_message: Optional[Dict] = None
    company_name: Optional[str] = None

class AddToCampaignRequest(BaseModel):
    campaign_type: CampaignType

class ArchiveCampaignRequest(BaseModel):
    campaign_type: CampaignType
    campaign_name: str

class UpdateMessageRequest(BaseModel):
    subject_line: str
    email_body: str

class RussiaTiesAnalysis(BaseModel):
    russia_ties_summary: str = Field(description="A summary of any direct or indirect ties to Russia found. State 'No ties found' if none are apparent.")
    risk_assessment: str = Field(description="A brief risk assessment (e.g., 'Low Risk', 'Moderate Risk', 'High Risk').")

class OutreachMessage(BaseModel):
    subject_line: str = Field(description="A compelling email subject line.")
    email_body: str = Field(description="The full, personalized email body.")

class PastCampaign(BaseModel):
    id: int
    name: str
    campaign_type: str
    archived_at: str
    contacts_count: int

class PastCampaignContact(BaseModel):
    id: int
    past_campaign_id: int
    contact_data: Dict


# --- External & AI Functions ---

def enrich_apollo_person(apollo_person_id: str) -> Optional[dict]:
    """
    Uses the /people/match endpoint to enrich a person's data and reveal their email.
    """
    apollo_api_key = os.getenv("APOLLO_API_KEY")
    if not apollo_api_key:
        raise HTTPException(status_code=500, detail="APOLLO_API_KEY not configured")

    params = {
        "id": apollo_person_id,
        "reveal_personal_emails": True
    }

    try:
        response = requests.post(
            "https://api.apollo.io/v1/people/match",
            headers={"X-Api-Key": apollo_api_key, 'Content-Type': 'application/json'},
            json=params,
            timeout=20
        )
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        error_detail = "Unknown Apollo Error"
        if e.response is not None:
            try:
                error_detail = e.response.json().get("error", {}).get("message", e.response.text)
            except json.JSONDecodeError:
                error_detail = e.response.text
        print(f"Error enriching Apollo person: {error_detail}")
        raise HTTPException(status_code=e.response.status_code if e.response else 503, detail=error_detail)


def analyze_russia_ties(person_data: dict, company_data: dict) -> Dict:
    gemini_api_key = os.getenv("GEMINI_API_KEY")
    if not gemini_api_key: raise HTTPException(500, "GEMINI_API_KEY not configured")
    llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", google_api_key=gemini_api_key, temperature=0.1).with_structured_output(RussiaTiesAnalysis)
    research_text = ""
    if person_data.get('linkedin_url'):
        linkedin_text = fetch_and_parse_url(person_data['linkedin_url'])
        if linkedin_text and "Error" not in linkedin_text:
             research_text += f"LinkedIn Profile Content:\n{linkedin_text[:4000]}\n\n"
    if not research_text:
        search_query = f"'{person_data.get('name')}' AND '{company_data.get('name')}' russia ties education work history origin"
        search_results = brightdata_search(search_query)
        if search_results and search_results[0].get('url'):
            web_text = fetch_and_parse_url(search_results[0]['url'])
            if web_text and "Error" not in web_text:
                research_text += f"Web Search Result for '{search_query}':\nURL: {search_results[0]['url']}\nContent: {web_text[:4000]}\n\n"
    if not research_text: research_text = "No public information could be retrieved for this person."
    prompt = f"""Analyze the provided data for potential ties to Russia. Focus on Russian origin, employment (especially at sanctioned companies), education, or public statements.
Person: {person_data.get('name')}, {person_data.get('title')} at {company_data.get('name')}
Research Text:
{research_text}
Provide a concise summary and risk assessment (Low, Moderate, High). State 'No ties found' if none are apparent."""
    analysis = llm.invoke(prompt)
    return analysis.dict()

def generate_outreach_message(person_data: dict, company_data: dict) -> Dict:
    gemini_api_key = os.getenv("GEMINI_API_KEY")
    if not gemini_api_key: raise HTTPException(500, "GEMINI_API_KEY not configured")
    llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", google_api_key=gemini_api_key, temperature=0.5).with_structured_output(OutreachMessage)
    company_industry = company_data.get('apollo_data', {}).get('organization', {}).get('industry', 'their industry')
    prompt = f"""You are a business development manager for a Ukrainian firm managing upstream oil and gas assets. Craft a personalized outreach email to the following individual to initiate a conversation about potential PARTNERSHIPS in Ukraine's oil and gas sector recovery. Be professional and peer-to-peer. Use their profile and company profile to craft a short and targeted personalized outreach message.\nRecipient: {person_data.get('name')}, Title: {person_data.get('title')}, Company: {company_data.get('name')}, Industry: {company_industry}"""
    message = llm.invoke(prompt)
    return message.dict()
    
# --- API Endpoints ---
@router.post("/{contact_id}/approve", response_model=Contact)
def approve_and_enrich_contact(contact_id: int, supabase: Client = Depends(get_supabase)):
    try:
        contact_res = supabase.table('contacts').select('*, companies(*)').eq('id', contact_id).single().execute()
        if not contact_res.data: raise HTTPException(404, "Contact not found.")
        if contact_res.data['status'] not in ['Sourced', 'Failed Enrichment']: raise HTTPException(400, f"Contact is already in '{contact_res.data['status']}' state.")
        
        supabase.table('contacts').update({'status': 'Pending Enrichment'}).eq('id', contact_id).execute()
        
        person_data_from_db = contact_res.data
        company_data = person_data_from_db.pop('companies')
        apollo_person_id = person_data_from_db.get('apollo_person_id')

        if not apollo_person_id:
            raise HTTPException(400, "Contact has no Apollo Person ID to enrich.")

        enriched_apollo_data = enrich_apollo_person(apollo_person_id)
        if not enriched_apollo_data or not enriched_apollo_data.get('person'):
             raise HTTPException(500, "Apollo enrichment did not return a person object.")

        person_data_for_analysis = {**person_data_from_db, **enriched_apollo_data.get('person', {})}

        russia_analysis = analyze_russia_ties(person_data_for_analysis, company_data)
        outreach_message_data = generate_outreach_message(person_data_for_analysis, company_data)
        
        contact_email = enriched_apollo_data.get('person', {}).get('email')

        update_data = {
            "email": contact_email, 
            "apollo_person_data": enriched_apollo_data, 
            "russia_ties_analysis": russia_analysis, 
            "outreach_message": outreach_message_data, 
            "status": 'Enriched'
        }
        
        supabase.table('contacts').update(update_data).eq('id', contact_id).execute()
        
        update_res = supabase.table('contacts').select('*, companies(name)').eq('id', contact_id).single().execute()
        updated_contact = update_res.data
        updated_contact['company_name'] = updated_contact.pop('companies')['name']
        return updated_contact

    except Exception as e:
        supabase.table('contacts').update({'status': 'Failed Enrichment'}).eq('id', contact_id).execute()
        if isinstance(e, HTTPException): raise e
        raise HTTPException(500, f"Enrichment failed: {str(e)}")


# Phone endpoint removed

@router.get("/", response_model=List[Contact])
def get_contacts(supabase: Client = Depends(get_supabase)):
    query = supabase.table('contacts').select('*, companies(name)').eq('status', 'Enriched')
    res = query.order('id', desc=True).execute()
    
    contacts = []
    for row in res.data:
        if row.get('companies'):
            row['company_name'] = row.pop('companies')['name']
        if not row.get('campaign_status'):
            row['campaign_status'] = 'Ready to Assign'
        contacts.append(row)
    return contacts

@router.post("/{contact_id}/campaign", response_model=Contact)
def add_contact_to_campaign(contact_id: int, req: AddToCampaignRequest, supabase: Client = Depends(get_supabase)):
    update_res = supabase.table('contacts').update({
        'campaign_status': 'In Campaign', 
        'campaign_type': req.campaign_type.value
    }).eq('id', contact_id).eq('status', 'Enriched').execute()
    
    if not update_res.data: raise HTTPException(404, "Enriched contact not found")

    final_res = supabase.table('contacts').select('*, companies(name)').eq('id', contact_id).single().execute()
    contact = final_res.data
    contact['company_name'] = contact.pop('companies')['name']
    return contact

@router.post("/campaigns/archive")
def archive_campaign(req: ArchiveCampaignRequest, supabase: Client = Depends(get_supabase)):
    contacts_to_archive_res = supabase.table('contacts').select('*, companies(name)').eq('campaign_status', 'In Campaign').eq('campaign_type', req.campaign_type.value).execute()
    contacts_to_archive = contacts_to_archive_res.data
    if not contacts_to_archive:
        raise HTTPException(404, "No active campaign contacts found to archive.")

    past_campaign_id = None
    try:
        insert_res = supabase.table('past_campaigns').insert({
            'name': req.campaign_name, 
            'campaign_type': req.campaign_type.value, 
            'contacts_count': len(contacts_to_archive)
        }).execute()
        if not insert_res.data:
            raise Exception("Failed to create past campaign entry.")
        
        past_campaign_id = insert_res.data[0]['id']

        for row in contacts_to_archive:
            if row.get('companies'):
                row['company_name'] = row.pop('companies')['name']

        snapshots_to_insert = [{'past_campaign_id': past_campaign_id, 'contact_data': c} for c in contacts_to_archive]
        supabase.table('past_campaign_contacts').insert(snapshots_to_insert).execute()

        contact_ids_to_update = [c['id'] for c in contacts_to_archive]
        supabase.table('contacts').update({
            'campaign_status': req.campaign_name,
            'campaign_type': None
        }).in_('id', contact_ids_to_update).execute()

        return {"message": f"Successfully archived campaign '{req.campaign_name}' with {len(contacts_to_archive)} contacts."}

    except Exception as e:
        if past_campaign_id:
            supabase.table('past_campaign_contacts').delete().eq('past_campaign_id', past_campaign_id).execute()
            supabase.table('past_campaigns').delete().eq('id', past_campaign_id).execute()
        raise HTTPException(status_code=500, detail=f"A step in the archiving process failed, transaction rolled back: {e}")

@router.get("/campaigns/past", response_model=List[PastCampaign])
def get_past_campaigns(supabase: Client = Depends(get_supabase)):
    res = supabase.table('past_campaigns').select('*').order('archived_at', desc=True).execute()
    return res.data

@router.get("/campaigns/past/{campaign_id}", response_model=List[PastCampaignContact])
def get_past_campaign_details(campaign_id: int, supabase: Client = Depends(get_supabase)):
    res = supabase.table('past_campaign_contacts').select('*').eq('past_campaign_id', campaign_id).execute()
    return res.data

@router.put("/{contact_id}/message", response_model=Contact)
def update_contact_message(contact_id: int, req: UpdateMessageRequest, supabase: Client = Depends(get_supabase)):
    contact_res = supabase.table('contacts').select('outreach_message').eq('id', contact_id).single().execute()
    if not contact_res.data or not contact_res.data.get('outreach_message'): raise HTTPException(404, "Contact or original message not found")
    message_data = contact_res.data['outreach_message']
    message_data['email_body'] = req.email_body
    message_data['subject_line'] = req.subject_line
    supabase.table('contacts').update({'outreach_message': message_data}).eq('id', contact_id).execute()
    update_res = supabase.table('contacts').select('*, companies(name)').eq('id', contact_id).single().execute()
    contact = update_res.data
    contact['company_name'] = contact.pop('companies')['name']
    return contact