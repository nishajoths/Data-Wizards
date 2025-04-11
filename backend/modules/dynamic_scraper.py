import asyncio
import traceback
import time
import requests
import json
from bs4 import BeautifulSoup
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
import re
from urllib.parse import urljoin, urlparse

# Initialize MongoDB client
client = AsyncIOMotorClient("mongodb://localhost:27017")
db = client.hackathon

async def run_dynamic_scraper(scrape_id, config, user_email):
    """Run the dynamic scraping job in the background with enhanced pagination"""
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
        
        # Initialize counters and tracking variables
        pages_scraped = 0
        items_found = 0
        current_url = url
        processed_urls = set()  # Track URLs we've already processed to avoid loops
        max_pages = 50  # Safety limit for pagination
        
        # Report starting the scrape
        await db.dynamic_scrapes.update_one(
            {"scrape_id": scrape_id},
            {"$set": {
                "pagination_progress": {
                    "current_page": 1,
                    "max_pages": max_pages,
                    "urls_discovered": [current_url],
                    "urls_processed": []
                }
            }}
        )
        
        while current_url and pages_scraped < max_pages:
            # Avoid processing the same URL twice
            if current_url in processed_urls:
                await db.dynamic_scrapes.update_one(
                    {"scrape_id": scrape_id},
                    {"$push": {"warnings": f"Pagination loop detected at {current_url}, stopping recursion"}}
                )
                break
            
            processed_urls.add(current_url)
            
            # Update current page being scraped
            await db.dynamic_scrapes.update_one(
                {"scrape_id": scrape_id},
                {"$set": {
                    "current_url": current_url,
                    "pagination_progress.current_page": pages_scraped + 1,
                    "pagination_progress.current_url": current_url
                },
                "$push": {"pagination_progress.urls_processed": current_url}}
            )
            
            try:
                # Fetch the page with a proper user agent
                headers = {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36"
                }
                response = requests.get(current_url, headers=headers, timeout=30)
                response.raise_for_status()
                
                # Parse the HTML
                soup = BeautifulSoup(response.text, 'html.parser')
                
                # Find all card elements
                card_elements = soup.select(card_selector)
                
                # Process each card
                page_items = 0
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
                        page_items += 1
                    except Exception as e:
                        # Log error but continue with other cards
                        print(f"Error processing card {i}: {e}")
                        await db.dynamic_scrapes.update_one(
                            {"scrape_id": scrape_id},
                            {"$push": {"errors": f"Error processing card {i} on page {pages_scraped+1}: {str(e)}"}}
                        )
                
                # Log page information
                await db.dynamic_scrapes.update_one(
                    {"scrape_id": scrape_id},
                    {"$push": {"page_details": {
                        "url": current_url,
                        "page_number": pages_scraped + 1,
                        "items_found": page_items,
                        "timestamp": datetime.utcnow().isoformat()
                    }}}
                )
                
                pages_scraped += 1
                
                # Enhanced pagination detection
                if pagination_selector:
                    next_page_url = find_next_page_link(soup, pagination_selector, current_url)
                    
                    if next_page_url and next_page_url != current_url and next_page_url not in processed_urls:
                        current_url = next_page_url
                        # Log discovered URL
                        await db.dynamic_scrapes.update_one(
                            {"scrape_id": scrape_id},
                            {"$push": {"pagination_progress.urls_discovered": current_url}}
                        )
                    else:
                        # Try alternative pagination detection methods if the selector didn't work
                        next_page_url = find_pagination_with_heuristics(soup, current_url, processed_urls)
                        if next_page_url:
                            current_url = next_page_url
                            # Log discovered URL with heuristic method
                            await db.dynamic_scrapes.update_one(
                                {"scrape_id": scrape_id},
                                {"$push": {
                                    "pagination_progress.urls_discovered": current_url,
                                    "notes": f"Found pagination link using heuristics: {current_url}"
                                }}
                            )
                        else:
                            # No more pagination links found
                            current_url = None
                else:
                    # Try to find pagination links even without explicit selector
                    next_page_url = find_pagination_with_heuristics(soup, current_url, processed_urls)
                    if next_page_url:
                        current_url = next_page_url
                        await db.dynamic_scrapes.update_one(
                            {"scrape_id": scrape_id},
                            {"$push": {
                                "pagination_progress.urls_discovered": current_url,
                                "notes": f"Found pagination link using heuristics: {current_url}"
                            }}
                        )
                    else:
                        current_url = None
                        
            except Exception as e:
                # Handle request errors
                await db.dynamic_scrapes.update_one(
                    {"scrape_id": scrape_id},
                    {"$push": {"errors": f"Failed to fetch page {current_url}: {str(e)}"}}
                )
                current_url = None
            
            # Add a small delay to avoid overloading the server
            await asyncio.sleep(2)
            
        # Update status to completed
        await db.dynamic_scrapes.update_one(
            {"scrape_id": scrape_id},
            {"$set": {
                "status": "completed",
                "end_time": datetime.utcnow().isoformat(),
                "pages_scraped": pages_scraped,
                "items_found": items_found,
                "pagination_summary": {
                    "total_pages": pages_scraped,
                    "total_urls_discovered": len(processed_urls),
                    "pagination_method": "selector" if pagination_selector else "heuristic"
                }
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
        "text_content": card_element.get_text().strip(),
        "links": [],
        "images": [],
        "prices": [],
        "headings": []
    }
    
    # Extract links
    for link in card_element.find_all('a', href=True):
        url = link['href']
        text = link.get_text().strip()
        data["links"].append({
            "url": url,
            "text": text or "[No link text]"
        })
    
    # Extract images
    for img in card_element.find_all('img'):
        src = img.get('src', '')
        alt = img.get('alt', '')
        data["images"].append({
            "src": src,
            "alt": alt
        })
    
    # Extract potential prices using regex patterns
    price_patterns = [
        r'\$\d+(?:\.\d{2})?',  # $XX.XX
        r'USD\s*\d+(?:\.\d{2})?',  # USD XX.XX
        r'€\d+(?:\.\d{2})?',  # €XX.XX
        r'£\d+(?:\.\d{2})?',  # £XX.XX
        r'\d+(?:\.\d{2})?\s*(?:USD|EUR|GBP)'  # XX.XX USD/EUR/GBP
    ]
    
    text_content = card_element.get_text()
    for pattern in price_patterns:
        matches = re.findall(pattern, text_content)
        if matches:
            data["prices"].extend(matches)
    
    # Extract headings
    for i in range(1, 7):
        for heading in card_element.find_all(f'h{i}'):
            data["headings"].append({
                "level": i,
                "text": heading.get_text().strip()
            })
    
    return data

def find_next_page_link(soup, pagination_selector, current_url):
    """
    Enhanced: Find the next page link based on pagination selector with fallback methods
    """
    try:
        # First try to find elements matching the selector
        pagination_elements = soup.select(pagination_selector)
        
        if not pagination_elements:
            return None
            
        # Try to identify the current page number
        current_page = find_current_page_number(pagination_elements)
        
        # Look for links with text/aria-label indicating "next"
        next_indicators = ['next', 'next page', '›', '»', 'next »', 'forward']
        
        # First priority: Look for elements with clear next page indicators
        for element in pagination_elements:
            element_text = element.get_text().strip().lower()
            aria_label = element.get('aria-label', '').lower()
            
            # Check text content and aria attributes for next indicators
            if any(indicator in element_text or indicator in aria_label for indicator in next_indicators):
                if element.name == 'a' and element.has_attr('href'):
                    return make_absolute_url(element['href'], current_url)
                elif element.find('a') and element.find('a').has_attr('href'):
                    return make_absolute_url(element.find('a')['href'], current_url)
        
        # Second priority: If we found current page number, look for page number + 1
        if current_page:
            next_page = current_page + 1
            for element in pagination_elements:
                if element.name == 'a' and element.has_attr('href'):
                    if element.get_text().strip() == str(next_page):
                        return make_absolute_url(element['href'], current_url)
        
        # Third priority: Look for any incremental number in URLs
        for element in pagination_elements:
            if element.name == 'a' and element.has_attr('href'):
                href = element['href']
                # Check for common pagination URL patterns
                if re.search(r'[?&]page=(\d+)', href) or re.search(r'[?&]p=(\d+)', href) or re.search(r'/page/(\d+)', href):
                    url_page_num = extract_page_number_from_url(href)
                    current_url_page_num = extract_page_number_from_url(current_url)
                    
                    if url_page_num and current_url_page_num and url_page_num > current_url_page_num:
                        return make_absolute_url(href, current_url)
        
        # Last resort: Just return the last element's href if it's different from current URL
        for element in reversed(pagination_elements):  # Reverse to check from the end
            if element.name == 'a' and element.has_attr('href'):
                href = make_absolute_url(element['href'], current_url)
                if href != current_url:
                    # Parse URLs to compare paths
                    current_parsed = urlparse(current_url)
                    href_parsed = urlparse(href)
                    
                    # If the paths are different but domains are the same
                    if (current_parsed.netloc == href_parsed.netloc and
                        current_parsed.path != href_parsed.path):
                        return href
        
        return None
    except Exception as e:
        print(f"Error finding next page link: {e}")
        print(traceback.format_exc())
        return None

def find_pagination_with_heuristics(soup, current_url, processed_urls):
    """Find pagination links using heuristic methods when selectors don't work"""
    try:
        # Common pagination containers
        container_selectors = [
            '.pagination', '#pagination', '.pager', '.pages', 
            '[aria-label="pagination"]', '[class*="pagination"]',
            '.page-numbers', '.page-navigation', '.page-nav'
        ]
        
        # Common next page indicators
        next_text_indicators = ['next', 'next page', 'next »', '›', '»', 'forward', 'more']
        
        # First check for obvious "next page" links anywhere on the page
        for indicator in next_text_indicators:
            # Try to find links with text containing indicator
            for a_tag in soup.find_all('a', string=lambda s: s and indicator in s.lower()):
                if a_tag.has_attr('href'):
                    next_url = make_absolute_url(a_tag['href'], current_url)
                    if next_url != current_url and next_url not in processed_urls:
                        return next_url
            
            # Try to find links with span/i text containing indicator
            for a_tag in soup.find_all('a'):
                if a_tag.has_attr('href'):
                    if a_tag.find(['span', 'i', 'div'], string=lambda s: s and indicator in s.lower()):
                        next_url = make_absolute_url(a_tag['href'], current_url)
                        if next_url != current_url and next_url not in processed_urls:
                            return next_url
        
        # Look for aria-label attributes
        for a_tag in soup.find_all('a', attrs={'aria-label': True}):
            if a_tag.has_attr('href') and any(ind in a_tag['aria-label'].lower() for ind in next_text_indicators):
                next_url = make_absolute_url(a_tag['href'], current_url)
                if next_url != current_url and next_url not in processed_urls:
                    return next_url
        
        # Look in common pagination containers
        for selector in container_selectors:
            container = soup.select_one(selector)
            if not container:
                continue
                
            # Find all links in this container
            links = container.find_all('a')
            if not links:
                continue
                
            # Check if any of these links have next indicators
            for a_tag in links:
                if a_tag.has_attr('href'):
                    a_text = a_tag.get_text().lower()
                    if any(ind in a_text for ind in next_text_indicators):
                        next_url = make_absolute_url(a_tag['href'], current_url)
                        if next_url != current_url and next_url not in processed_urls:
                            return next_url
            
            # Look for incremented page numbers in URLs
            current_page_num = extract_page_number_from_url(current_url)
            if current_page_num:
                for a_tag in links:
                    if a_tag.has_attr('href'):
                        href = a_tag['href']
                        url_page_num = extract_page_number_from_url(href)
                        if url_page_num and url_page_num == current_page_num + 1:
                            return make_absolute_url(href, current_url)
        
        # Try common patterns in URL query parameters
        current_parsed = urlparse(current_url)
        query_params = current_parsed.query.split('&')
        
        # Check if current URL has page parameter
        page_param = None
        page_value = None
        
        for param in query_params:
            if '=' in param:
                key, value = param.split('=', 1)
                if key in ['page', 'p', 'pg', 'paged']:
                    try:
                        page_param = key
                        page_value = int(value)
                        break
                    except ValueError:
                        pass
        
        # If we found a page parameter, construct the next page URL
        if page_param and page_value is not None:
            new_query = []
            for param in query_params:
                if '=' in param:
                    key, value = param.split('=', 1)
                    if key == page_param:
                        new_query.append(f"{key}={page_value + 1}")
                    else:
                        new_query.append(param)
                else:
                    new_query.append(param)
            
            # Construct the new URL
            new_query_string = '&'.join(new_query)
            parts = list(current_parsed)
            parts[4] = new_query_string
            next_url = urlparse('').geturl()
            
            # Check if the URL is on the same domain
            if urlparse(next_url).netloc == current_parsed.netloc:
                return next_url
        
        return None
    except Exception as e:
        print(f"Error finding pagination with heuristics: {e}")
        print(traceback.format_exc())
        return None

def find_current_page_number(pagination_elements):
    """Try to identify the current page number in pagination elements"""
    try:
        # Look for elements with active/current classes
        for element in pagination_elements:
            # Check for active/current class
            if element.has_attr('class') and any(cls in element.get('class', []) for cls in ['active', 'current', 'selected']):
                # Try to extract a number
                try:
                    return int(element.get_text().strip())
                except ValueError:
                    pass
                
                # Try to find a page number in the URL if it's a link
                if element.name == 'a' and element.has_attr('href'):
                    page_num = extract_page_number_from_url(element['href'])
                    if page_num:
                        return page_num
                        
            # Look for aria-current attribute
            if element.has_attr('aria-current') and element.get('aria-current') == 'page':
                try:
                    return int(element.get_text().strip())
                except ValueError:
                    pass
        
        # Look for elements with page numbers
        for element in pagination_elements:
            text = element.get_text().strip()
            try:
                return int(text)
            except ValueError:
                pass
        
        return None
    except Exception:
        return None

def extract_page_number_from_url(url):
    """Extract page number from URL patterns"""
    try:
        # Check common patterns
        patterns = [
            r'[?&]page=(\d+)',      # ?page=X or &page=X
            r'[?&]p=(\d+)',         # ?p=X or &p=X
            r'/page/(\d+)',          # /page/X/
            r'/p/(\d+)',             # /p/X/
            r'-page-(\d+)',          # -page-X
            r'/pages/(\d+)',         # /pages/X
        ]
        
        for pattern in patterns:
            match = re.search(pattern, url)
            if match:
                return int(match.group(1))
        
        return None
    except Exception:
        return None

def make_absolute_url(href, base_url):
    """Convert a relative URL to an absolute URL"""
    if not href:
        return base_url
    return urljoin(base_url, href)
