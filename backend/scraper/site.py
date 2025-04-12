import requests
import time
from bs4 import BeautifulSoup
from pymongo import MongoClient
from bson import ObjectId
import re
from urllib.parse import urljoin
import json
import re
from datetime import datetime
from urllib.parse import urlparse, urljoin
import hashlib  # Add this import for content_hash

# Create MongoDB connection at module level
mongo_client = MongoClient("mongodb://localhost:27017")
mongo_db = mongo_client.hackathon

def scrape_website(url, extract_product_info=False, search_keywords=None):
    """
    Scrape a website and extract its content, including links for recursive scraping.
    """
    start_time = time.time()
    
    # Use a proper user agent to avoid being blocked
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36"
    }
    
    try:
        # Make the request and measure network metrics
        request_start = time.time()
        response = requests.get(url, headers=headers, timeout=30)
        response_time = time.time() - request_start
        response.raise_for_status()
        
        # Calculate content size and overall metrics
        content_size = len(response.content)
        total_time = time.time() - start_time
        speed_kbps = (content_size / 1024) / response_time if response_time > 0 else 0
        
        # Enhanced network metrics
        network_metrics = {
            "duration_ms": int(response_time * 1000),
            "total_time_ms": int(total_time * 1000),
            "content_size_bytes": content_size,
            "speed_kbps": round(speed_kbps, 2),
            "status_code": response.status_code,
            "headers": dict(response.headers),
            "time_to_first_byte_ms": int(response.elapsed.total_seconds() * 1000),
            "compression_used": "gzip" in response.headers.get("content-encoding", "").lower(),
            "cache_status": response.headers.get("x-cache", "unknown"),
            "connection_reused": "keep-alive" in response.headers.get("connection", "").lower(),
            "server": response.headers.get("server", "unknown")
        }
        
        # Parse the HTML
        soup = BeautifulSoup(response.content, 'html.parser')
        
        # Extract base URL for resolving relative links
        base_url = url
        base_tag = soup.find('base', href=True)
        if base_tag:
            base_url = base_tag['href']
        
        # Extract metadata from the page - FIX: Changed function name to match the defined function
        meta_info = extract_meta_info(soup, url)
        
        # Extract text content
        text_content = extract_text_content(soup)
        
        # Extract images
        images = extract_images(soup, base_url)
        
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
        
        # Extract all links
        extracted_links = extract_links(soup, base_url)
        
        # Extract product information if requested
        product_info = {}
        if extract_product_info:
            product_info = extract_product_information(soup, url)
        
        # Search for keywords in meta tags
        keyword_matches = []
        if search_keywords:
            meta_title = soup.title.string if soup.title else ""
            meta_description = soup.find("meta", attrs={"name": "description"})
            meta_keywords = soup.find("meta", attrs={"name": "keywords"})

            meta_text = f"{meta_title} {meta_description.get('content', '') if meta_description else ''} {meta_keywords.get('content', '') if meta_keywords else ''}"
            for keyword in search_keywords:
                if re.search(keyword, meta_text, re.IGNORECASE):
                    keyword_matches.append(keyword)
        
        # Create a unique ID for this page based on URL and content hash
        content_hash = hashlib.md5(response.content).hexdigest()
        url_hash = hashlib.md5(url.encode()).hexdigest()
        page_id = f"{url_hash}-{content_hash[:10]}"
        
        # Initialize orders for consistency
        orders = []
        
        # Prepare the data structure for storage
        scraped_data = {
            "_id": page_id,
            "url": url,
            "title": meta_info.get("title", ""),
            "meta_info": meta_info,
            "content": {
                "text_content": text_content,
                "images": images,
                "image_texts": image_texts,
                "orders": orders,
                "links": links  # Add extracted links
            },
            "network_metrics": network_metrics,
            "raw_html": response.text,  # Store the raw HTML for link extraction
            "extracted_links": extracted_links  # Add extracted links to the returned data
        }
        
        print(f"Scraping completed: {len(text_content)} text elements, {len(images)} images, {len(links)} links")
        return scraped_data
    except Exception as e:
        # Return error information with enhanced error detail - FIX: Define error_msg
        end_time = time.time()
        error_msg = str(e)  # Define error_msg from the exception
        error_type = type(e).__name__
        
        # More detailed error capturing
        if isinstance(e, requests.exceptions.Timeout):
            error_type = "Timeout"
        elif isinstance(e, requests.exceptions.ConnectionError):
            error_type = "ConnectionError"
        elif isinstance(e, requests.exceptions.TooManyRedirects):
            error_type = "TooManyRedirects"
        
        # Define default network_metrics in case of error
        network_metrics = {
            "duration_ms": int((end_time - start_time) * 1000),
            "error_type": error_type,
            "status_code": None
        }
        
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
    
    # Extract title
    title_tag = soup.find('title')
    if title_tag:
        meta_info['title'] = title_tag.get_text(strip=True)
    
    # Extract meta tags
    meta_tags = {}
    for tag in soup.find_all('meta'):
        name = tag.get('name', tag.get('property', ''))
        if name and tag.get('content'):
            meta_tags[name] = tag.get('content')
    
    meta_info['meta_tags'] = meta_tags
    
    # Extract Open Graph data
    og_data = {}
    for tag in soup.find_all('meta', property=lambda x: x and x.startswith('og:')):
        if tag.get('content'):
            og_data[tag['property'][3:]] = tag['content']
    
    if og_data:
        meta_info['open_graph'] = og_data
    
    # Extract JSON-LD structured data
    structured_data = []
    for script in soup.find_all('script', type='application/ld+json'):
        try:
            data = json.loads(script.string)
            structured_data.append(data)
        except:
            pass
    
    if structured_data:
        meta_info['structured_data'] = structured_data
    
    return meta_info

def extract_text_content(soup):
    """Extract text content from the page"""
    # First, remove script and style elements
    for script_or_style in soup(['script', 'style']):
        script_or_style.extract()
    
    text_content = []
    
    # Extract paragraph text
    for p in soup.find_all('p'):
        p_text = p.get_text(strip=True)
        if p_text and len(p_text) > 10:  # Avoid very short paragraphs
            text_content.append({
                "type": "paragraph",
                "content": p_text
            })
    
    # Extract headings
    for i in range(1, 7):
        for h in soup.find_all(f'h{i}'):
            h_text = h.get_text(strip=True)
            if h_text:
                text_content.append({
                    "type": "heading",
                    "level": i,
                    "content": h_text
                })
    
    # Extract lists
    for ul in soup.find_all('ul'):
        list_items = []
        for li in ul.find_all('li', recursive=False):
            li_text = li.get_text(strip=True)
            if li_text:
                list_items.append(li_text)
        
        if list_items:
            text_content.append({
                "type": "list",
                "list_type": "unordered",
                "items": list_items
            })
    
    for ol in soup.find_all('ol'):
        list_items = []
        for li in ol.find_all('li', recursive=False):
            li_text = li.get_text(strip=True)
            if li_text:
                list_items.append(li_text)
        
        if list_items:
            text_content.append({
                "type": "list",
                "list_type": "ordered",
                "items": list_items
            })
    
    return text_content

def extract_images(soup, base_url):
    """Extract images from the page"""
    images = []
    
    for img in soup.find_all('img', src=True):
        src = img['src']
        alt = img.get('alt', '')
        
        # Make relative URLs absolute
        full_url = urljoin(base_url, src)
        
        images.append({
            "type": "image",
            "url": full_url,
            "alt_text": alt
        })
    
    return images

def extract_links(soup, base_url):
    """Extract all links from the page"""
    extracted_links = []
    
    for a_tag in soup.find_all('a', href=True):
        href = a_tag['href']
        link_text = a_tag.get_text(strip=True)
        
        # Make relative URLs absolute
        try:
            absolute_url = urljoin(base_url, href)
            
            # Only include links with reasonable text length and that aren't just "#"
            if not href.startswith('#') and not href.startswith('javascript:'):
                extracted_links.append({
                    'url': absolute_url,
                    'text': link_text[:100] if link_text else "",  # Limit text length
                    'has_inner_image': bool(a_tag.find('img')),  # Check if the link contains an image
                    'inner_image_alt': a_tag.find('img').get('alt', '') if a_tag.find('img') else None,
                    'class': a_tag.get('class', []),
                    'id': a_tag.get('id', ''),
                    'link_type': 'internal' if urlparse(base_url).netloc == urlparse(absolute_url).netloc else 'external'
                })
        except:
            pass
    
    # Remove duplicate URLs
    seen_urls = set()
    unique_links = []
    
    for link in extracted_links:
        if link['url'] not in seen_urls:
            seen_urls.add(link['url'])
            unique_links.append(link)
    
    return unique_links

def extract_product_information(soup, url):
    """Extract product information from the page"""
    product_info = {}
    
    # Try to extract from JSON-LD structured data first
    for script in soup.find_all('script', type='application/ld+json'):
        try:
            data = json.loads(script.string)
            
            # Check if it's a Product schema
            if isinstance(data, dict) and data.get('@type') == 'Product':
                product_info['name'] = data.get('name', '')
                product_info['description'] = data.get('description', '')
                
                # Get price info
                if 'offers' in data:
                    if isinstance(data['offers'], dict):
                        product_info['price'] = data['offers'].get('price', '')
                        product_info['currency'] = data['offers'].get('priceCurrency', '')
                        product_info['availability'] = data['offers'].get('availability', '')
                    elif isinstance(data['offers'], list) and data['offers']:
                        product_info['price'] = data['offers'][0].get('price', '')
                        product_info['currency'] = data['offers'][0].get('priceCurrency', '')
                        product_info['availability'] = data['offers'][0].get('availability', '')
                
                # Get image
                if 'image' in data:
                    if isinstance(data['image'], str):
                        product_info['image_url'] = data['image']
                    elif isinstance(data['image'], list) and data['image']:
                        product_info['image_url'] = data['image'][0]
                
                # Get brand
                if 'brand' in data and isinstance(data['brand'], dict):
                    product_info['brand'] = data['brand'].get('name', '')
                
                # Found product info, return it
                if product_info.get('name'):
                    return product_info
        except:
            pass
    
    # If structured data didn't work, try heuristic extraction
    
    # Look for product name in heading
    potential_names = []
    for i in range(1, 4):  # Check h1, h2, h3
        headings = soup.find_all(f'h{i}')
        if headings:
            potential_names.extend([h.get_text(strip=True) for h in headings])
    
    if potential_names:
        product_info['name'] = potential_names[0]
    
    # Look for product description
    description_selectors = [
        '.product-description', '.description', '#product-description',
        '[itemprop="description"]', '.product-short-description'
    ]
    
    for selector in description_selectors:
        desc_elem = soup.select_one(selector)
        if desc_elem:
            product_info['description'] = desc_elem.get_text(strip=True)
            break
    
    # Look for price
    price_selectors = [
        '.price', '.product-price', '[itemprop="price"]', '.current-price',
        '.sale-price', '.our-price', '#product-price'
    ]
    
    for selector in price_selectors:
        price_elem = soup.select_one(selector)
        if price_elem:
            price_text = price_elem.get_text(strip=True)
            # Try to extract the numeric part of the price
            price_match = re.search(r'\$?\d+(?:\.\d{2})?', price_text)
            if price_match:
                product_info['price'] = price_match.group(0)
            else:
                product_info['price'] = price_text
            break
    
    # Look for currency
    currency_symbols = {'$': 'USD', '€': 'EUR', '£': 'GBP', '¥': 'JPY', '₹': 'INR', '₩': 'KRW'}
    if product_info.get('price'):
        for symbol, currency in currency_symbols.items():
            if symbol in product_info['price']:
                product_info['currency'] = currency
                break
    
    # Look for brand
    brand_selectors = [
        '[itemprop="brand"]', '.brand', '.product-brand', '.manufacturer'
    ]
    
    for selector in brand_selectors:
        brand_elem = soup.select_one(selector)
        if brand_elem:
            product_info['brand'] = brand_elem.get_text(strip=True)
            break
    
    return product_info

def store_in_mongodb(scraped_data):
    """Store scraped data in MongoDB"""
    # Create ID if not present
    if "_id" not in scraped_data:
        # Generate an ID if needed
        pass
    
    # Store the data - use mongo_db instead of undefined db
    try:
        # Use the module-level mongo_db instead of undefined db
        mongo_db.sites.update_one(
            {"url": scraped_data["url"]}, 
            {"$set": scraped_data}, 
            upsert=True
        )
    except Exception as e:
        print(f"MongoDB error: {str(e)}")
    
    return scraped_data.get("_id", None)
