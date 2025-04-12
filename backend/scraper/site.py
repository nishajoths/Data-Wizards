import requests
from bs4 import BeautifulSoup
from PIL import Image
import pytesseract
from io import BytesIO
from pymongo import MongoClient
import time
import json
import re
from datetime import datetime
from urllib.parse import urlparse, urljoin  # Add these imports

def scrape_website(url):
    print(f"Scraping website: {url}")
    # Record start time for network metrics
    start_time = time.time()
    network_metrics = {
        "url": url,
        "start_time": start_time,
        "end_time": None,
        "duration_ms": None,
        "status_code": None,
        "content_size_bytes": 0,
        "speed_kbps": None,
        "headers": {}
    }
    
    # Fetch the webpage content
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36"
        }
        response = requests.get(url, headers=headers, timeout=15)
        
        # Record network metrics
        network_metrics["end_time"] = time.time()
        network_metrics["duration_ms"] = int((network_metrics["end_time"] - network_metrics["start_time"]) * 1000)
        network_metrics["status_code"] = response.status_code
        network_metrics["content_size_bytes"] = len(response.content)
        
        # Calculate download speed in KB/s
        if network_metrics["duration_ms"] > 0:
            network_metrics["speed_kbps"] = (network_metrics["content_size_bytes"] / 1024) / (network_metrics["duration_ms"] / 1000)
        
        # Store important headers
        for header in ["content-type", "server", "cache-control"]:
            if header in response.headers:
                network_metrics["headers"][header] = response.headers[header]
                
        print(f"Request completed: status={response.status_code}, size={len(response.content)} bytes")
    except Exception as e:
        error_msg = f"Failed to fetch the webpage: {str(e)}"
        print(f"Error: {error_msg}")
        return {
            "error": error_msg,
            "network_metrics": network_metrics,
            "content": {"text_content": [], "images": [], "image_texts": [], "orders": []}
        }
    
    if response.status_code != 200:
        error_msg = f"Failed to fetch the webpage. Status code: {response.status_code}"
        print(f"Error: {error_msg}")
        return {
            "error": error_msg,
            "network_metrics": network_metrics,
            "content": {"text_content": [], "images": [], "image_texts": [], "orders": []}
        }
    
    try:
        print("Parsing HTML content...")
        soup = BeautifulSoup(response.content, 'html.parser')
        
        # Extract meta information
        meta_info = extract_meta_info(soup, url)
        
        # Extract textual content with metadata
        print("Extracting text content...")
        text_content = []
        for p in soup.find_all(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li']):
            text = p.get_text(strip=True)
            if text:  # Only add non-empty text
                text_content.append({
                    "type": "paragraph",
                    "content": text
                })
        
        # Extract image URLs with metadata
        print("Extracting images...")
        images = []
        for img_tag in soup.find_all('img'):
            img_url = img_tag.get('src')
            if img_url:
                if not img_url.startswith(('http://', 'https://')):
                    img_url = requests.compat.urljoin(url, img_url)
                images.append({
                    "type": "image",
                    "url": img_url,
                    "alt_text": img_tag.get('alt', '').strip()
                })
        
        # Extract links for tracking
        links = []
        for a_tag in soup.find_all('a', href=True):
            href = a_tag.get('href')
            if href and not href.startswith(('javascript:', '#')):
                # Normalize URL
                if not href.startswith(('http://', 'https://')):
                    href = urljoin(url, href)  # Use urljoin to properly handle relative URLs
                links.append({
                    "href": href,
                    "text": a_tag.get_text(strip=True)
                })
        
        # Extract text from images with metadata - skip this for performance
        image_texts = []
        # We'll skip OCR for performance reasons
        
        # Extract orders with metadata (example assumes orders are in a table)
        orders = []
        # Skip order extraction for now

        # Structure the extracted data
        structured_data = {
            "url": url,
            "meta_info": meta_info,
            "content": {
                "text_content": text_content,
                "images": images,
                "image_texts": image_texts,
                "orders": orders,
                "links": links  # Add extracted links
            },
            "network_metrics": network_metrics,
            "raw_html": response.text  # Store the raw HTML for link extraction
        }
        
        print(f"Scraping completed: {len(text_content)} text elements, {len(images)} images, {len(links)} links")
        return structured_data
    except Exception as e:
        error_msg = f"Error parsing website content: {str(e)}"
        print(f"Error: {error_msg}")
        import traceback
        print(traceback.format_exc())
        
        # Return at least partial data if we have it
        return {
            "url": url,
            "error": error_msg,
            "network_metrics": network_metrics,
            "content": {"text_content": [], "images": [], "image_texts": [], "orders": [], "links": []}
        }

def extract_meta_info(soup, url):
    """Extract comprehensive metadata from the page"""
    meta_info = {
        "url": url,
        "extracted_at": datetime.now().isoformat(),
        "basic": {},
        "open_graph": {},
        "twitter": {},
        "structured_data": []
    }
    
    # Extract title and basic meta tags
    title_tag = soup.find('title')
    if title_tag:
        meta_info["basic"]["title"] = title_tag.get_text()
    
    # Extract common meta tags
    for meta in soup.find_all('meta'):
        if meta.has_attr('name') and meta.has_attr('content'):
            meta_info["basic"][meta['name']] = meta['content']
            
        # Also check for http-equiv meta tags
        if meta.has_attr('http-equiv') and meta.has_attr('content'):
            meta_info["basic"][f"http-equiv:{meta['http-equiv']}"] = meta['content']
    
    # Extract Open Graph tags
    for meta in soup.find_all('meta', attrs={'property': re.compile('^og:')}):
        if meta.has_attr('content'):
            property_name = meta['property'].replace('og:', '')
            meta_info["open_graph"][property_name] = meta['content']
    
    # Extract Twitter Card tags
    for meta in soup.find_all('meta', attrs={'name': re.compile('^twitter:')}):
        if meta.has_attr('content'):
            property_name = meta['name'].replace('twitter:', '')
            meta_info["twitter"][property_name] = meta['content']
    
    # Extract canonical URL
    canonical_link = soup.find('link', rel='canonical')
    if canonical_link and canonical_link.has_attr('href'):
        meta_info["basic"]["canonical"] = canonical_link['href']
    
    # Extract favicon
    favicon = soup.find('link', rel=lambda r: r and ('icon' in r or r == 'shortcut icon'))
    if favicon and favicon.has_attr('href'):
        meta_info["basic"]["favicon"] = requests.compat.urljoin(url, favicon['href'])
    
    # Extract JSON-LD structured data
    for script in soup.find_all('script', attrs={'type': 'application/ld+json'}):
        try:
            if script.string:
                data = json.loads(script.string)
                meta_info["structured_data"].append(data)
        except:
            pass
    
    # Clean up empty sections
    for section in ["basic", "open_graph", "twitter"]:
        if not meta_info[section]:
            meta_info.pop(section)
    
    if not meta_info["structured_data"]:
        meta_info.pop("structured_data")
    
    return meta_info

def store_in_mongodb(data):
    try:
        print(f"Storing data in MongoDB for URL: {data.get('url', 'unknown')}")
        # Connect to MongoDB
        client = MongoClient("mongodb://localhost:27017/")
        db = client["hackathon"]
        collection = db["sites"]
        
        # Insert the data into the collection
        result = collection.insert_one(data)
        print(f"Data successfully stored in MongoDB with ID: {result.inserted_id}")
        return result.inserted_id
    except Exception as e:
        print(f"Error storing data in MongoDB: {e}")
        import traceback
        print(traceback.format_exc())
        return None
