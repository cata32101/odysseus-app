# odysseus-app/utils.py

import os
import requests
import urllib.parse
from bs4 import BeautifulSoup, XMLParsedAsHTMLWarning
import warnings
from supabase import create_client, Client
from fastapi import Depends, HTTPException, Request
from dotenv import load_dotenv
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
import ssl

warnings.filterwarnings("ignore", category=XMLParsedAsHTMLWarning)
load_dotenv()

class SSLAdapter(HTTPAdapter):
    def init_poolmanager(self, *args, **kwargs):
        context = ssl.create_default_context(ssl.Purpose.SERVER_AUTH)
        # --- FIX: Set a specific, modern TLS version to improve connection stability ---
        context.minimum_version = ssl.TLSVersion.TLSv1_2
        context.set_ciphers('DEFAULT@SECLEVEL=1')
        kwargs['ssl_context'] = context
        return super(SSLAdapter, self).init_poolmanager(*args, **kwargs)

# --- Supabase & Auth (No changes needed) ---
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

# --- CENTRALIZED & ROBUST REQUESTING LOGIC ---
def make_request_with_proxy(target_url: str, zone: str, extra_headers: dict = None) -> requests.Response:
    """
    Central function to make any HTTP GET request through the Bright Data proxy,
    allowing for different zones and custom headers.
    """
    customer_id = os.getenv("BRIGHTDATA_CUSTOMER_ID")
    proxy_password = None
    password_env_var = None

    if zone == 'serp_api1':
        proxy_password = os.getenv("BRIGHTDATA_SERP_PASSWORD")
        password_env_var = "BRIGHTDATA_SERP_PASSWORD"
    else:
        proxy_password = os.getenv("BRIGHTDATA_UNLOCKER_PASSWORD")
        password_env_var = "BRIGHTDATA_UNLOCKER_PASSWORD"

    if not customer_id:
        raise Exception("FATAL: BRIGHTDATA_CUSTOMER_ID environment variable is not set.")
    if not proxy_password:
        raise Exception(f"FATAL: The password environment variable '{password_env_var}' is not set for zone '{zone}'.")

    proxy_user = f'brd-customer-{customer_id}-zone-{zone}'
    proxy_url = f'http://{proxy_user}:{proxy_password}@brd.superproxy.io:22225'
    proxies = {'http': proxy_url, 'https': proxy_url}

    session = requests.Session()
    retries = Retry(total=3, backoff_factor=0.5, status_forcelist=[429, 500, 502, 503, 504])
    session.mount('https://', SSLAdapter(max_retries=retries))
    session.mount('http://', HTTPAdapter(max_retries=retries))

    # --- FIX: Merge default headers with any extra headers provided ---
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'}
    if extra_headers:
        headers.update(extra_headers)

    response = session.get(target_url, proxies=proxies, headers=headers, timeout=60, verify=False)
    response.raise_for_status()
    return response


def fetch_and_parse_url(url: str) -> str:
    """
    Fetches and parses a URL using the 'Web Unlocker' zone.
    """
    if not url or not url.startswith(('http://', 'https://')):
        return "Invalid URL provided."
    try:
        unlocker_zone = os.getenv("BRIGHTDATA_UNLOCKER_ZONE")
        if not unlocker_zone:
            raise Exception("BRIGHTDATA_UNLOCKER_ZONE is not set in environment variables.")
        
        print(f"📡 Fetching URL via Unlocker Proxy: {url}")
        response = make_request_with_proxy(url, zone=unlocker_zone)
        
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
    Performs a Google search using the 'SERP API' zone.
    """
    print(f"⚡️ Performing web search for: {query}")
    search_url = f"https://www.google.com/search?q={urllib.parse.quote(query)}&gl=us&hl=en"
    # --- FIX: Use the correct environment variable for the zone ---
    serp_zone = os.getenv("BRIGHTDATA_ZONE")
    if not serp_zone:
        raise Exception("BRIGHTDATA_ZONE for SERP API is not set.")
        
    try:
        response = make_request_with_proxy(search_url, zone=serp_zone)
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