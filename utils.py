# odysseus-app/utils.py

import os
import requests
import urllib.parse
from bs4 import BeautifulSoup, XMLParsedAsHTMLWarning
import warnings
from supabase import create_client, Client
from fastapi import Depends, HTTPException, Request
from dotenv import load_dotenv

warnings.filterwarnings("ignore", category=XMLParsedAsHTMLWarning)
load_dotenv()

# --- Supabase & Auth (No changes needed here) ---
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

def get_supabase() -> Client:
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise HTTPException(status_code=500, detail="Supabase URL/Key not configured in .env")
    return create_client(SUPABASE_URL, SUPABASE_KEY)

async def get_current_user(request: Request, supabase: Client = Depends(get_supabase)):
    auth_header = request.headers.get("Authorization")
    if not auth_header:
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    token = auth_header.replace("Bearer ", "")
    try:
        user_response = supabase.auth.get_user(token)
        user = user_response.user
        if not user:
            raise HTTPException(status_code=401, detail="Invalid token or user not found")
        return user
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

# --- CORRECTED HELPER FUNCTIONS ---

def make_brightdata_request(target_url: str, zone: str) -> requests.Response:
    """
    Centralized function to make a direct API call to Bright Data,
    specifying which zone to use.
    """
    api_key = os.getenv("BRIGHT_DATA_API_KEY")
    if not api_key:
        raise Exception("Error: BRIGHT_DATA_API_KEY is not set.")

    api_url = "https://api.brightdata.com/request"
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    body = {"zone": zone, "url": target_url, "format": "raw"}
    
    response = requests.post(api_url, json=body, headers=headers, timeout=60)
    response.raise_for_status()
    return response

def fetch_and_parse_url(url: str) -> str:
    """
    Fetches a regular URL using the Bright Data 'Unlocker' zone.
    """
    if not url or not url.startswith(('http://', 'https://')):
        return "Invalid URL provided."
    try:
        unlocker_zone = os.getenv("BRIGHTDATA_UNLOCKER_ZONE")
        if not unlocker_zone:
            raise Exception("BRIGHTDATA_UNLOCKER_ZONE environment variable is not set.")
            
        print(f"📡 Fetching URL via Unlocker Zone: {url}")
        response = make_brightdata_request(url, zone=unlocker_zone)
        
        soup = BeautifulSoup(response.text, 'lxml')
        for element in soup(["script", "style", "header", "footer", "nav", "aside", "form"]):
            element.decompose()
        
        text = ' '.join(soup.stripped_strings)
        return text[:8000]
    except Exception as e:
        error_message = f"Error fetching URL {url}: {str(e)}"
        print(error_message)
        return error_message

def brightdata_search(query: str) -> list:
    """
    Performs a Google search using the Bright Data 'SERP API' zone.
    """
    print(f"⚡️ Performing web search for: {query}")
    search_url = f"https://www.google.com/search?q={urllib.parse.quote(query)}&gl=us&hl=en"
    serp_zone = os.getenv("BRIGHTDATA_ZONE") # This is your 'serp_api1'
    if not serp_zone:
        raise Exception("BRIGHTDATA_ZONE for SERP API is not set.")
        
    try:
        response = make_brightdata_request(search_url, zone=serp_zone)
        soup = BeautifulSoup(response.text, "lxml")
        results = []
        for result_div in soup.find_all('div', class_='tF2Cxc'):
            title = (result_div.find('h3').get_text() if result_div.find('h3') else "No Title")
            link = (result_div.find('a')['href'] if result_div.find('a') else "#")
            snippet_tag = result_div.find('div', class_='VwiC3b')
            snippet = snippet_tag.get_text(strip=True) if snippet_tag else "No Snippet"
            results.append({"name": title, "url": link, "snippet": snippet})
        print(f"✅ Parsed {len(results)} results from HTML for '{query}'.")
        return results
    except Exception as e:
        print(f"Error during Bright Data search for query '{query}': {e}")
        return []