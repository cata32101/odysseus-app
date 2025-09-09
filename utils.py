# utils.py
import os
import json
import requests
import urllib.parse
from bs4 import BeautifulSoup
from supabase import create_client, Client
from fastapi import Depends, HTTPException, Request
from dotenv import load_dotenv

load_dotenv()

# --- Supabase Client Setup ---
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY") # Service role key for backend

def get_supabase() -> Client:
    """Dependency to get a Supabase client instance for backend operations."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise HTTPException(status_code=500, detail="Supabase URL/Key not configured in .env")
    return create_client(SUPABASE_URL, SUPABASE_KEY)

# --- Authentication Middleware ---
async def get_current_user(request: Request, supabase: Client = Depends(get_supabase)):
    """
    Dependency that verifies the JWT from the Authorization header
    and returns the user object. Raises 401 if invalid.
    """
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

# --- Helper Functions ---
def fetch_and_parse_url(url: str) -> str:
    """
    Fetches a URL and returns clean, stripped text content,
    removing common irrelevant HTML tags.
    """
    if not url or not url.startswith(('http://', 'https://')):
        return "Invalid URL provided."
    try:
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'}
        response = requests.get(url, timeout=15, headers=headers)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.content, 'lxml')
        for element in soup(["script", "style", "header", "footer", "nav", "aside", "form"]):
            element.decompose()
        
        text = ' '.join(soup.stripped_strings)
        return text[:6000]
    except requests.exceptions.RequestException as e:
        print(f"Error fetching URL {url}: {e}")
        return f"Error fetching URL: An error occurred while trying to access the content."

def brightdata_search(query: str) -> list:
    """
    Performs a web search using Bright Data's Web Unlocker API and parses the HTML for Google results.
    """
    print(f"⚡️ Performing web search for: {query}")
    api_key = os.getenv("BRIGHT_DATA_API_KEY")
    zone = os.getenv("BRIGHTDATA_ZONE", "serp_api1")
    if not api_key:
        print("Error: BRIGHT_DATA_API_KEY is not set.")
        return []
    body = {"zone": zone, "url": f"https://www.google.com/search?q={urllib.parse.quote(query)}&gl=us&hl=en", "format": "raw"}
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    url = "https://api.brightdata.com/request"
    try:
        response = requests.post(url, json=body, headers=headers, timeout=30)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "lxml")
        results = []
        # This class selector is specific to Google's search result structure
        for result_div in soup.find_all('div', class_='tF2Cxc'):
            title = (result_div.find('h3').get_text() if result_div.find('h3') else "No Title")
            link = (result_div.find('a')['href'] if result_div.find('a') else "#")
            snippet_tag = result_div.find('div', class_='VwiC3b')
            snippet = snippet_tag.get_text(strip=True) if snippet_tag else "No Snippet"
            results.append({"name": title, "url": link, "snippet": snippet})
        print(f"✅ Parsed {len(results)} results from HTML for '{query}'.")
        return results
    except requests.exceptions.RequestException as e:
        error_content = e.response.text if e.response is not None and e.response.text else "No response body"
        print(f"Error during Bright Data search: {e}. Body: {error_content}")
        return []
