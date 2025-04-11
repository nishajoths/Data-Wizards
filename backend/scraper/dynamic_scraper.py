import asyncio
import aiohttp
import traceback
from datetime import datetime
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorClient
from bs4 import BeautifulSoup
import re
import json
from urllib.parse import urljoin, urlparse

# Connect to MongoDB
client = AsyncIOMotorClient("mongodb://localhost:27017")
db = client.hackathon

async def run_dynamic_scraper(scrape_id, config, user_email):
    """
    Asynchronously run the dynamic scraper to extract data from webpages based on selectors.
    
    Args:
        scrape_id: Unique identifier for this scraping job
        config: Dictionary containing scraping configuration (URL, selectors, etc.)
        user_email: Email of the user who initiated the scraping
    """
    print(f"Starting dynamic scraper for job {scrape_id}")
    
    # Update status to running
    await db.dynamic_scrapes.update_one(
        {"scrape_id": scrape_id},
        {"$set": {"status": "running", "start_time": datetime.utcnow().isoformat()}}
    )
    
    try:
        # Main scraping variables
        url = config.get('url')
        card_selector = config.get('cardSelector')
        pagination_selector = config.get('paginationSelector')
        extracted_data = []
        pages_scraped = 0
        max_pages = 10  # Default limit
        
        # Validate required fields
        if not url or not card_selector:
            raise ValueError("URL and card selector are required")
        
        # Parse base URL for joining relative links
        parsed_url = urlparse(url)
        base_url = f"{parsed_url.scheme}://{parsed_url.netloc}"
        
        # Create a session for making HTTP requests
        async with aiohttp.ClientSession() as session:
            current_url = url
            
            # Process pages until max_pages or no more pagination
            while current_url and pages_scraped < max_pages:
                # Update status
                await db.dynamic_scrapes.update_one(
                    {"scrape_id": scrape_id},
                    {"$set": {
                        "current_url": current_url,
                        "pages_scraped": pages_scraped
                    }}
                )
                
                print(f"Scraping page: {current_url}")
                
                try:
                    # Fetch the page
                    async with session.get(current_url, timeout=30) as response:
                        if response.status != 200:
                            print(f"Failed to fetch {current_url}, status: {response.status}")
                            break
                        
                        html = await response.text()
                        soup = BeautifulSoup(html, 'html.parser')
                        
                        # Extract cards
                        cards = soup.select(card_selector)
                        print(f"Found {len(cards)} cards on page {pages_scraped+1}")
                        
                        # Process each card
                        page_items = []
                        for card in cards:
                            try:
                                # Basic data extraction (links, images, text)
                                links = [urljoin(base_url, a['href']) for a in card.select('a[href]')]
                                images = [urljoin(base_url, img['src']) for img in card.select('img[src]')]
                                text = card.get_text(strip=True, separator=' ')
                                
                                # Extract structured data if available
                                structured_data = extract_structured_data(card)
                                
                                item_data = {
                                    "text": text,
                                    "html": str(card),
                                    "links": links,
                                    "images": images,
                                    "url": current_url,
                                    "page_number": pages_scraped + 1,
                                    "structured_data": structured_data
                                }
                                
                                page_items.append(item_data)
                            except Exception as card_error:
                                print(f"Error processing card: {card_error}")
                        
                        # Store the results for this page
                        if page_items:
                            # Store in MongoDB
                            await db.dynamic_scrape_results.insert_many([{
                                "scrape_id": scrape_id,
                                "user_email": user_email,
                                "url": current_url,
                                "page_number": pages_scraped + 1,
                                "timestamp": datetime.utcnow().isoformat(),
                                "data": item_data
                            } for item_data in page_items])
                            
                            extracted_data.extend(page_items)
                        
                        # Find next page if pagination selector is provided
                        next_page_url = None
                        if pagination_selector:
                            next_page_url = find_next_page(soup, pagination_selector, current_url, base_url)
                        
                        if next_page_url == current_url:
                            # Avoid infinite loops
                            break
                        
                        current_url = next_page_url
                        pages_scraped += 1
                        
                        # Small delay to avoid overloading the server
                        await asyncio.sleep(2)
                except Exception as page_error:
                    print(f"Error processing page {current_url}: {page_error}")
                    await db.dynamic_scrapes.update_one(
                        {"scrape_id": scrape_id},
                        {"$push": {"errors": f"Error on page {current_url}: {str(page_error)}"}}
                    )
                    break
            
            # Update completion status
            completion_status = "completed" if pages_scraped > 0 else "failed"
            await db.dynamic_scrapes.update_one(
                {"scrape_id": scrape_id},
                {"$set": {
                    "status": completion_status,
                    "end_time": datetime.utcnow().isoformat(),
                    "pages_scraped": pages_scraped,
                    "items_found": len(extracted_data)
                }}
            )
            
            print(f"Dynamic scraper finished: {scrape_id}, status: {completion_status}")
            
    except Exception as e:
        error_msg = f"Error in dynamic scraper: {str(e)}"
        print(error_msg)
        print(traceback.format_exc())
        
        # Update status to failed
        await db.dynamic_scrapes.update_one(
            {"scrape_id": scrape_id},
            {"$set": {
                "status": "failed",
                "end_time": datetime.utcnow().isoformat(),
                "error": error_msg
            }}
        )

def extract_structured_data(card):
    """Extract any structured data from the card"""
    structured_data = {}
    
    # Extract common structured patterns like prices, titles, etc.
    # Example: Look for price patterns
    price_candidates = card.select('.price, [class*="price"], .amount, [class*="amount"]')
    if price_candidates:
        price_text = price_candidates[0].get_text(strip=True)
        # Try to extract number from price
        price_match = re.search(r'[\$£€]?\s*([0-9,]+(?:\.[0-9]+)?)', price_text)
        if price_match:
            structured_data['price'] = price_match.group(0)
    
    # Look for title
    title_candidates = card.select('h2, h3, h1, .title, [class*="title"], .name, [class*="name"]')
    if title_candidates:
        structured_data['title'] = title_candidates[0].get_text(strip=True)
    
    # Look for description
    desc_candidates = card.select('p, .description, [class*="desc"], .summary, [class*="summary"]')
    if desc_candidates:
        structured_data['description'] = desc_candidates[0].get_text(strip=True)
    
    return structured_data

def find_next_page(soup, selector, current_url, base_url):
    """Find the next page URL based on the pagination selector"""
    try:
        # Try different strategies to find the next page link
        
        # Strategy 1: Look for 'next' links in the selector
        pagination_element = soup.select_one(selector)
        if pagination_element:
            next_links = pagination_element.select('a[rel="next"], a:contains("Next"), a:contains("next"), a:contains("»"), a[class*="next"]')
            if next_links:
                next_href = next_links[0].get('href')
                if next_href:
                    return urljoin(base_url, next_href)
        
        # Strategy 2: Find the "active" page and get the next sibling
        active_elements = soup.select(f'{selector} .active, {selector} [aria-current="page"], {selector} .current')
        if active_elements:
            active = active_elements[0]
            active_link = active.find_parent('a') or active
            
            # Try to find the next sibling that is a link
            next_sibling = active_link.find_next_sibling('a') or active.find_next_sibling()
            if next_sibling and next_sibling.name == 'a' and next_sibling.get('href'):
                return urljoin(base_url, next_sibling.get('href'))
        
        # Strategy 3: Check for incremental page numbers in URL
        # e.g., ?page=1 -> ?page=2 or /page/1/ -> /page/2/
        parsed = urlparse(current_url)
        
        # Look for query parameter like ?page=X
        if parsed.query:
            query_params = {}
            for param in parsed.query.split('&'):
                if '=' in param:
                    key, value = param.split('=')
                    query_params[key] = value
            
            # Look for common pagination parameters
            for param in ['page', 'p', 'pg', 'paged']:
                if param in query_params and query_params[param].isdigit():
                    # Increment page number
                    query_params[param] = str(int(query_params[param]) + 1)
                    
                    # Rebuild query string
                    new_query = '&'.join([f"{k}={v}" for k, v in query_params.items()])
                    parts = list(parsed)
                    parts[4] = new_query  # index 4 is query
                    return urlparse('').geturl()
        
        # Look for path pattern like /page/X/
        page_path_match = re.search(r'(.*/page/|.*/)(\d+)(/.*|$)', parsed.path)
        if page_path_match:
            prefix = page_path_match.group(1)
            page_num = int(page_path_match.group(2)) + 1
            suffix = page_path_match.group(3)
            new_path = f"{prefix}{page_num}{suffix}"
            
            parts = list(parsed)
            parts[2] = new_path  # index 2 is path
            return urlparse('').geturl()
    
    except Exception as e:
        print(f"Error finding next page: {e}")
    
    # No next page found
    return None
