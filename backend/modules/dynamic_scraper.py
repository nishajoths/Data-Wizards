import asyncio
import traceback
import time
import requests
import json
from bs4 import BeautifulSoup
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId

# Initialize MongoDB client
client = AsyncIOMotorClient("mongodb://localhost:27017")
db = client.hackathon

async def run_dynamic_scraper(scrape_id, config, user_email):
    """Run the dynamic scraping job in the background"""
    try:
        # Update status to running
        await db.dynamic_scrapes.update_one(
            {"scrape_id": scrape_id},
            {"$set": {"status": "running", "start_time": datetime.utcnow().isoformat()}}
        )
        
        # Extract needed configuration
        url = config["url"]
        card_selector = config["cardSelector"]
        pagination_selector = config["paginationSelector"]
        
        # Initialize counters
        pages_scraped = 0
        items_found = 0
        current_url = url
        has_next_page = True
        
        while has_next_page:
            # Update status with progress
            await db.dynamic_scrapes.update_one(
                {"scrape_id": scrape_id},
                {"$set": {
                    "pages_scraped": pages_scraped,
                    "items_found": items_found,
                    "current_url": current_url
                }}
            )
            
            # Fetch the page
            try:
                response = requests.get(current_url, timeout=30)
                response.raise_for_status()
                
                # Parse the HTML
                soup = BeautifulSoup(response.text, 'html.parser')
                
                # Find all card elements
                card_elements = soup.select(card_selector)
                
                # Process each card
                for i, card in enumerate(card_elements):
                    try:
                        # Extract data from the card
                        card_data = extract_card_data(card, i)
                        
                        # Save to MongoDB
                        await db.dynamic_scrape_results.insert_one({
                            "scrape_id": scrape_id,
                            "page_number": pages_scraped + 1,
                            "item_number": items_found + 1,
                            "url": current_url,
                            "data": card_data,
                            "html": str(card),
                            "timestamp": datetime.utcnow().isoformat()
                        })
                        
                        items_found += 1
                    except Exception as e:
                        # Log error but continue with other cards
                        print(f"Error processing card {i}: {e}")
                        await db.dynamic_scrapes.update_one(
                            {"scrape_id": scrape_id},
                            {"$push": {"errors": f"Error processing card {i} on page {pages_scraped+1}: {str(e)}"}}
                        )
                
                pages_scraped += 1
                
                # Check for pagination if selector is provided
                if pagination_selector:
                    next_page = find_next_page_link(soup, pagination_selector, current_url)
                    if next_page and next_page != current_url:
                        current_url = next_page
                    else:
                        has_next_page = False
                else:
                    # No pagination selector provided, stop after first page
                    has_next_page = False
                    
                # Add a small delay to avoid overloading the server
                await asyncio.sleep(2)
                
            except requests.RequestException as e:
                # Handle request errors
                await db.dynamic_scrapes.update_one(
                    {"scrape_id": scrape_id},
                    {"$push": {"errors": f"Failed to fetch page: {str(e)}"}}
                )
                has_next_page = False
        
        # Update status to completed
        await db.dynamic_scrapes.update_one(
            {"scrape_id": scrape_id},
            {"$set": {
                "status": "completed",
                "end_time": datetime.utcnow().isoformat(),
                "pages_scraped": pages_scraped,
                "items_found": items_found
            }}
        )
        
    except Exception as e:
        # Update status to error
        print(f"Error in dynamic scraper: {e}")
        print(traceback.format_exc())
        await db.dynamic_scrapes.update_one(
            {"scrape_id": scrape_id},
            {"$set": {
                "status": "error",
                "end_time": datetime.utcnow().isoformat(),
                "error_message": str(e)
            }}
        )

def extract_card_data(card_element, index):
    """Extract structured data from a card element"""
    data = {
        "index": index,
        "text_content": card_element.get_text(strip=True),
    }
    
    # Extract links
    links = []
    for a in card_element.find_all('a', href=True):
        links.append({
            "text": a.get_text(strip=True),
            "href": a['href']
        })
    data["links"] = links
    
    # Extract images
    images = []
    for img in card_element.find_all('img'):
        img_data = {
            "src": img.get('src', ''),
            "alt": img.get('alt', '')
        }
        # Add other attributes
        for attr in ['width', 'height', 'title', 'loading']:
            if img.has_attr(attr):
                img_data[attr] = img[attr]
        images.append(img_data)
    data["images"] = images
    
    # Extract structured data based on common patterns
    # Headings
    headings = {}
    for i, h in enumerate(card_element.find_all(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])):
        headings[f"heading_{i+1}"] = {
            "tag": h.name,
            "text": h.get_text(strip=True)
        }
    data["headings"] = headings
    
    # Key-value pairs (often used for product details, specs, etc.)
    key_value_pairs = {}
    # Look for definition lists
    for dl in card_element.find_all('dl'):
        dts = dl.find_all('dt')
        dds = dl.find_all('dd')
        for i, (dt, dd) in enumerate(zip(dts, dds)):
            if i < len(dds):
                key_value_pairs[dt.get_text(strip=True)] = dd.get_text(strip=True)
    
    # Look for table rows that might contain key-value pairs
    for tr in card_element.find_all('tr'):
        cells = tr.find_all(['td', 'th'])
        if len(cells) >= 2:
            key_value_pairs[cells[0].get_text(strip=True)] = cells[1].get_text(strip=True)
    
    data["attributes"] = key_value_pairs
    
    # Look for prices (common patterns)
    prices = []
    # Price classes patterns
    price_patterns = ['.price', '.product-price', '.offer-price', 'span[itemprop="price"]', '.amount']
    for pattern in price_patterns:
        for price_elem in card_element.select(pattern):
            prices.append(price_elem.get_text(strip=True))
    
    # Currency symbols
    currency_symbols = ['$', '€', '£', '¥', '₹', '₽', 'USD', 'EUR', 'GBP']
    for elem in card_element.find_all(text=True):
        text = elem.strip()
        if any(symbol in text for symbol in currency_symbols):
            if text not in prices:
                prices.append(text)
    
    data["prices"] = prices
    
    return data

def find_next_page_link(soup, pagination_selector, current_url):
    """Find the next page link based on pagination selector"""
    # Find all elements matching the pagination selector
    pagination_elements = soup.select(pagination_selector)
    
    # Common patterns for next page
    next_patterns = ['next', 'Next', '>', '›', '»', 'Next Page']
    
    # First, look for elements with these common next page texts
    for pattern in next_patterns:
        for element in pagination_elements:
            if pattern in element.get_text():
                if element.name == 'a' and element.has_attr('href'):
                    return make_absolute_url(element['href'], current_url)
                # Check if parent or grandparent is a link
                parent = element.parent
                if parent and parent.name == 'a' and parent.has_attr('href'):
                    return make_absolute_url(parent['href'], current_url)
                grandparent = parent.parent if parent else None
                if grandparent and grandparent.name == 'a' and grandparent.has_attr('href'):
                    return make_absolute_url(grandparent['href'], current_url)
    
    # If we can't find specific next links, try to find the current page number
    # and then look for a link to the next page number
    current_page = find_current_page_number(pagination_elements)
    if current_page:
        next_page_number = current_page + 1
        # Look for a link with the next page number
        for element in pagination_elements:
            if element.name == 'a' and element.has_attr('href') and element.get_text().strip() == str(next_page_number):
                return make_absolute_url(element['href'], current_url)
    
    # If all else fails, look for links with page query parameters
    for element in pagination_elements:
        if element.name == 'a' and element.has_attr('href'):
            href = element['href']
            if 'page=' in href or 'p=' in href:
                # Check if this might be a next page link
                from urllib.parse import urlparse, parse_qs
                parsed_url = urlparse(href)
                params = parse_qs(parsed_url.query)
                page_param = params.get('page', params.get('p', [None]))[0]
                if page_param and page_param.isdigit():
                    if int(page_param) > current_page:
                        return make_absolute_url(href, current_url)
    
    return None

def find_current_page_number(pagination_elements):
    """Try to identify the current page number in pagination elements"""
    # Look for elements with active/current/selected classes
    for element in pagination_elements:
        classes = element.get('class', [])
        if any(c in ' '.join(classes).lower() for c in ['active', 'current', 'selected']):
            text = element.get_text().strip()
            if text.isdigit():
                return int(text)
    
    # Look for non-link elements among link elements (often the current page is not a link)
    link_elements = [el for el in pagination_elements if el.name == 'a']
    non_link_elements = [el for el in pagination_elements if el.name != 'a' and el.get_text().strip().isdigit()]
    
    if link_elements and non_link_elements:
        text = non_link_elements[0].get_text().strip()
        if text.isdigit():
            return int(text)
    
    # Default to page 1 if we can't determine the current page
    return 1

def make_absolute_url(href, base_url):
    """Convert a relative URL to an absolute URL"""
    from urllib.parse import urljoin
    return urljoin(base_url, href)
