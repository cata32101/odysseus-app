# odysseus-app/utils.py

import os
import json
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

# Ignore the XML parsed as HTML warning, as it's not critical here
warnings.filterwarnings("ignore", category=XMLParsedAsHTMLWarning)
load_dotenv()

# --- Custom SSL Adapter to fix SSLEOFError ---
class SSLAdapter(HTTPAdapter):
    """
    A custom Transport Adapter that forces a more compatible SSL/TLS context.
    This is a robust solution for the 'SSLEOFError' and related connection issues
    seen when scraping at scale from cloud environments.
    """
    def init_poolmanager(self, *args, **kwargs):
        # Create a custom SSL context
        context = ssl.create_default_context(ssl.Purpose.SERVER_AUTH)
        
        # Force a more compatible set of ciphers
        ciphers = [
            "ECDHE-ECDSA-AES128-GCM-SHA256", "ECDHE-RSA-AES128-GCM-SHA256",
            "ECDHE-ECDSA-AES256-GCM-SHA384", "ECDHE-RSA-AES256-GCM-SHA384",
            "ECDHE-ECDSA-CHACHA20-POLY1305", "ECDHE-RSA-CHACHA20-POLY1305",
            "DHE-RSA-AES128-GCM-SHA256", "DHE-RSA-AES256-GCM-SHA384"
        ]
        context.set_ciphers(':'.join(ciphers))

        # This option can help with servers that have outdated or non-standard TLS implementations.
        context.options |= ssl.OP_NO_TLSv1_3

        kwargs['ssl_context'] = context
        return super(SSLAdapter, self).init_poolmanager(*args, **kwargs)

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

# --- CENTRALIZED & ROBUST REQUESTING LOGIC ---
def make_request_with_proxy(target_url: str) -> requests.Response:
    """
    Central function to make any HTTP GET request through the Bright Data proxy,
    with robust retry logic and custom SSL handling.
    """
    api_key = os.getenv("BRIGHT_DATA_API_KEY")
    customer_id = os.getenv("BRIGHTDATA_CUSTOMER_ID")
    zone = os.getenv("BRIGHTDATA_ZONE", "serp_api1")

    if not all([api_key, customer_id]):
        raise Exception("Error: Bright Data API Key or Customer ID is not set in .env file.")

    # --- FIX: Use the correct port and dynamically construct the username ---
    proxy_user = f'brd-customer-{customer_id}-zone-{zone}'
    proxy_url = f'http://{proxy_user}:{api_key}@brd.superproxy.io:33335' # <-- THE PORT IS NOW CORRECT
    
    proxies = {'http': proxy_url, 'https': proxy_url}
    
    session = requests.Session()
    
    # Define retry strategy
    retries = Retry(
        total=3, 
        backoff_factor=1, 
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods={"GET", "POST"}
    )
    
    # Mount the custom SSL adapter and retry adapter
    session.mount('https://', SSLAdapter(max_retries=retries))
    session.mount('http://', HTTPAdapter(max_retries=retries))

    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'}
    
    # Make the request through the proxy
    response = session.get(target_url, proxies=proxies, headers=headers, timeout=60, verify=False)
    response.raise_for_status()
    return response

def fetch_and_parse_url(url: str) -> str:
    """
    Fetches and parses a URL using the centralized proxy function.
    """
    if not url or not url.startswith(('http://', 'https://')):
        return "Invalid URL provided."
    try:
        print(f"📡 Fetching URL via Proxy: {url}")
        response = make_request_with_proxy(url)
        
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
    Performs a Google search using the centralized proxy function.
    """
    print(f"⚡️ Performing web search for: {query}")
    search_url = f"https://www.google.com/search?q={urllib.parse.quote(query)}&gl=us&hl=en"
    
    try:
        response = make_request_with_proxy(search_url)
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