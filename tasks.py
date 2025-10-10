# odysseus-app/tasks.py

try:
    import urllib3.contrib.pyopenssl
    urllib3.contrib.pyopenssl.inject_into_urllib3()
except ImportError:
    print("Warning: pyopenssl not found. SSL errors may occur.")

import os
import json
import concurrent.futures
from celery import Celery
from celery.exceptions import SoftTimeLimitExceeded
from dotenv import load_dotenv
import requests
from supabase import create_client, Client, ClientOptions
from langchain_google_genai import ChatGoogleGenerativeAI
import time
from urllib.parse import urlparse
import httpx

# Import the centralized request function from utils
from utils import make_request_with_proxy, fetch_and_parse_url, brightdata_search
from models import (
    GeographyAnalysis, IndustryAnalysis, RussiaAnalysis, SizeAnalysis, FinalAnalysis, Status
)

load_dotenv()

# --- Celery Configuration ---
REDIS_URL = os.getenv("REDIS_URL")
if not REDIS_URL:
    print("WARNING: REDIS_URL environment variable not found. Defaulting to localhost.")
    REDIS_URL = "redis://localhost:6379/0"
print(f"INFO: Configuring Celery with broker URL: {REDIS_URL}")

celery_app = Celery(
    'tasks',
    broker=REDIS_URL,
    backend=REDIS_URL
)

# --- CORRECTED HELPER FUNCTIONS ---
def get_supabase_client() -> Client:
    """Creates a Supabase client that routes all its traffic through the Bright Data proxy."""
    SUPABASE_URL = os.getenv("SUPABASE_URL")
    SUPABASE_KEY = os.getenv("SUPABASE_KEY")
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise Exception("Supabase URL/Key not configured for Celery worker.")
    
    # Pass the configured httpx client via ClientOptions (replaces postgrest_client_options)
    return create_client(
        SUPABASE_URL, 
        SUPABASE_KEY
    )

def get_apollo_enrichment(domain: str) -> dict | None:
    """Gets Apollo enrichment data, routing the request through the Bright Data proxy."""
    apollo_api_key = os.getenv("APOLLO_API_KEY")
    if not apollo_api_key:
        print("APOLLO_API_KEY not found")
        return None
    try:
        # --- FIX 1 (Input Domain Cleaning): Robustly sanitize the domain input ---
        if "http" in domain:
            clean_domain = urlparse(domain).netloc
        else:
            clean_domain = domain.split('/')[0]
        
        # Remove 'www.' if it exists
        if clean_domain.startswith('www.'):
            clean_domain = clean_domain[4:]
            
        # NEW FIX: Remove trailing dots, slashes, or other junk characters
        clean_domain = clean_domain.strip().strip('./')
        # -------------------------------------------------------------------------

        api_url = f"https://api.apollo.io/v1/organizations/enrich?domain={clean_domain}"
        
        unlocker_zone = os.getenv("BRIGHTDATA_UNLOCKER_ZONE")
        if not unlocker_zone:
            raise Exception("BRIGHTDATA_UNLOCKER_ZONE is not set in environment variables.")

        apollo_headers = {"X-Api-Key": apollo_api_key}
            
        print(f"📡 Fetching Apollo data via Unlocker Proxy for: {clean_domain}")
        # The request is made directly, bypassing the make_request_with_proxy retry logic
        response = requests.get(api_url, headers=apollo_headers, timeout=60, verify=False)
        
        # --- FIX 3 (Robustness): Check for HTTP status code errors before trying to parse JSON ---
        response.raise_for_status() 
        
        response_data = response.json()

        # --- FIX 2 (Output URL Cleaning): Clean up the organization's linkedin_url ---
        organization_data = response_data.get('organization')
        if organization_data:
            linkedin_url = organization_data.get('linkedin_url')
            if linkedin_url and isinstance(linkedin_url, str) and linkedin_url.endswith('.'):
                organization_data['linkedin_url'] = linkedin_url.rstrip('.')
        # -------------------------------------------------------------------------

        return response_data
    except Exception as e:
        print(f"Apollo API error for domain {domain}: {e}")
        return None

def get_gemini_enrichment_basic(domain: str) -> dict | None:
    """
    A robust fallback to get basic company info from Gemini if Apollo fails.
    It retries on failure and handles non-JSON responses gracefully.
    """
    print(f"⚠️ Apollo failed for {domain}. Falling back to Gemini basic vetting.")
    gemini_api_key = os.getenv("GEMINI_API_KEY")
    if not gemini_api_key:
        print("ERROR: GEMINI_API_KEY not found for fallback.")
        return None

    # --- FIX: Use a more stable and widely available model ---
    llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", google_api_key=gemini_api_key)
    
    # Conduct a simple search to get context for the LLM
    transcript, _ = conduct_targeted_research([f"company name for {domain}", f"{domain} official linkedin page"])
    
    # A more detailed prompt to ensure the model returns only JSON
    prompt = f"""
    Analyze the following web search transcript for the domain "{domain}".
    Your task is to extract the company's official name and its official LinkedIn URL.
    
    Research Transcript:
    ---
    {transcript}
    ---

    You MUST respond with a valid JSON object. Do not include any other text, markdown, or explanations.
    The JSON object should contain "name" and "linkedin_url" as keys.
    If a value cannot be confidently determined from the text, return null for that key.

    Example of a perfect response:
    {{"name": "Example Corp", "linkedin_url": "https://www.linkedin.com/company/example"}}
    """
    
    # --- FIX: Add a robust retry loop and better error handling ---
    for attempt in range(3):
        try:
            response_content = llm.invoke(prompt).content
            
            # Clean the response to extract only the JSON part
            if '```json' in response_content:
                clean_response = response_content.split('```json')[1].split('```')[0].strip()
            else:
                clean_response = response_content.strip()

            if not clean_response:
                print(f"Attempt {attempt + 1}/3: Gemini returned an empty response for {domain}.")
                time.sleep(2 * (attempt + 1)) # Exponential backoff
                continue

            data = json.loads(clean_response)
            # Ensure we return a dictionary in the expected format
            return {"organization": {"name": data.get("name"), "linkedin_url": data.get("linkedin_url")}}

        except json.JSONDecodeError:
            print(f"Attempt {attempt + 1}/3: Could not parse Gemini's non-JSON response for {domain}. Response: '{response_content}'")
            time.sleep(2 * (attempt + 1))
        except Exception as e:
            print(f"Attempt {attempt + 1}/3: An unexpected error occurred during Gemini fallback for {domain}: {e}")
            time.sleep(2 * (attempt + 1))
            
    print(f"CRITICAL: All Gemini fallback attempts failed for {domain}.")
    return None # Return None after all retries have failed

def conduct_targeted_research(queries: list[str]) -> tuple[str, list[dict]]:
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
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
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
    if not gemini_api_key: raise Exception("GEMINI_API_KEY not found")
    company_name = company_data.get("organization", {}).get("name")
    if not company_name or company_name == "Unknown Company":
        print(f"🚫 Skipping multi-agent research because no valid company name was found.")
        return { "status": Status.FAILED.value, "investment_reasoning": "Failed to identify a valid company name during enrichment." }
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
    - **Output:** You MUST respond with a valid JSON object containing `geography_score` and `geography_reasoning`. Briefly state the source of the information.
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
    - **Output:** You MUST respond with a valid JSON object containing `industry_score` and `industry_reasoning`. Briefly state the source of the information.
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
    - **Output:** You MUST respond with a valid JSON object containing `russia_score` and `russia_reasoning`. Briefly state the source of the information.
    """),
        "size": (SizeAnalysis, f"""
    You are an analyst sourcing mid-sized companies for potential partnerships.
    Evaluate the company's size based on employee count and revenue from the dossier and research. If irrelevant information on other companies and topics is present, ignore it. your goal is to analyze the company **{company_name}**, thats all.
    - **Scoring (0-10):** 10 for an ideal mid-market size (50-5000 employees). Score lower for companies that are too small (<10) or too large (>10,000), however a large company is still better than a very small one. a large corporation with 25 thousand should get a 1-2. Also take revenue into account, for example 50 employees but large revenue for their size is a score improvement.
    - **Output:** You MUST respond with a valid JSON object containing `size_score` and `size_reasoning`. Briefly state the source of the information.
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
                raise Exception(f"LLM analysis failed for topic: {topic}")
    print("✍️ Synthesizing final analysis...")
    final_llm = ChatGoogleGenerativeAI(**llm_args).with_structured_output(FinalAnalysis)
    final_prompt = f"""
    You are a senior analyst synthesizing research for a Ukrainian upstream oil and gas asset management firm. Your sole focus is to find potential partners or potential investors in the upstream oil and gas sector.
    Based ONLY on the provided research transcript and dossier for **{company_name}**, generate a final, holistic profile.

    **Primary Investment Thesis:** We are looking for partners who are EITHER **investment firms, funds or offices with primary portfolio of upstream oil and gas sector** OR **operators of upstream oil and gas assets**. Our ideal partner is a **mid-sized company (50-5,000 employees)** with a focus on **geopolitically high-risk regions (e.g., Africa, South America, Eastern Europe)**, and has **no ties to Russia**.

    **Instructions for 'investment_reasoning':**
    1.  **Strictly adhere to the provided text.** Do not use outside knowledge. If the text doesn't support a conclusion, state that the information is not available.
    2.  Start your reasoning with "Yes", "No", or "Depends".
    3.  **"No":** Immediately say "No" if the company is completely irrelevant (e.g., a software or retail company with no energy assets). 
    4.  **"Depends":** Use "Depends" for companies that meet some but not all criteria (e.g., they are in the right industry but the wrong size, or they are upstream but in a different geography, or they meet all criteria but: have ties with russia,  are a huge conglomerate). Explain the nuance clearly.
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
    weights = {'geography': 0.33, 'industry': 0.33, 'russia': 0.17, 'size': 0.17}
    unified_score = sum(final_results.get(f'{topic}_score', 0) * weight for topic, weight in weights.items())
    final_results['unified_score'] = round(unified_score, 2)
    print(f"🎉 Vetting Complete for {company_name}!")
    return final_results

def vet_single_company(company: dict, supabase: Client) -> dict | None:
    supabase.table('companies').update({'status': Status.VETTING.value}).eq('id', company['id']).execute()
    apollo_data = get_apollo_enrichment(company['domain'])
    if not apollo_data or not apollo_data.get("organization"):
        apollo_data = get_gemini_enrichment_basic(company['domain'])
        if not apollo_data or not apollo_data.get("organization"):
             raise Exception("Primary (Apollo) and fallback (Gemini) enrichment failed.")
    vetting_results = get_gemini_vetting(apollo_data)
    org_data = apollo_data.get("organization", {})
    update_data = {
        "name": org_data.get("name", company['domain']),
        "status": Status.VETTED.value,
        "apollo_data": apollo_data,
        "website_url": org_data.get("website_url"),
        "company_linkedin_url": org_data.get("linkedin_url"),
        **vetting_results
    }
    update_response = supabase.table('companies').update(update_data).eq('id', company['id']).execute()
    return update_response.data[0] if update_response.data else None

@celery_app.task(
    name='tasks.run_vetting_task',
    bind=True,
    max_retries=3,
    soft_time_limit=2000,
    time_limit=2500
)
def run_vetting_task(self, company_ids: list[int]):
    print(f"Celery task started: Vetting {len(company_ids)} companies.")
    supabase = get_supabase_client()
    vetted_count = 0
    for company_id in company_ids:
        try:
            company_res = supabase.table('companies').select('*').eq('id', company_id).single().execute()
            if company_res.data:
                result = vet_single_company(company_res.data, supabase)
                if result:
                    vetted_count += 1
        except SoftTimeLimitExceeded:
            print(f"Soft time limit exceeded for company ID {company_id}. Marking as failed and moving on.")
            supabase.table('companies').update({'status': Status.FAILED.value}).eq('id', company_id).execute()
            continue
        except Exception as e:
            print(f"Error vetting company ID {company_id} in Celery task: {e}")
            supabase.table('companies').update({'status': Status.FAILED.value}).eq('id', company_id).execute()
            continue
    print(f"Celery task finished: Successfully processed {vetted_count} of {len(company_ids)} companies.")
    return f"Successfully vetted {vetted_count} of {len(company_ids)} companies."