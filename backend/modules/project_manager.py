from scraper.robots import Robots
from scraper.sitemap import Sitemap
from scraper.site import scrape_website, store_in_mongodb
from motor.motor_asyncio import AsyncIOMotorClient
from fastapi import HTTPException
import datetime
from bson import ObjectId
import traceback
import threading
import asyncio
import concurrent.futures
import queue
from queue import Queue
import json
import uuid
import time
import math
from utils.websocket_manager import ConnectionManager
import re
import requests
from bs4 import BeautifulSoup
from urllib.parse import urlparse
from pymongo import MongoClient

client = AsyncIOMotorClient("mongodb://localhost:27017")
db = client.hackathon
projects_collection = db.projects
users_collection = db.users

# Global thread pool for extraction tasks
thread_pool = concurrent.futures.ThreadPoolExecutor(max_workers=5)
# Message queue for extraction logs
message_queues = {}
# Dictionary to track active extraction processes with interrupt flags
active_extractions = {}
# Dictionary to track detailed extraction statistics
extraction_stats = {}

MAX_MONGODB_DOC_SIZE = 12 * 1024 * 1024  # 12MB document size limit
CHUNK_SIZE = 100  # Number of items per chunk

# Status constants
STATUS_RUNNING = "running"
STATUS_INTERRUPTED = "interrupted"
STATUS_COMPLETED = "completed"
STATUS_ERROR = "error"

async def consume_messages(client_id, ws_manager):
    """
    Asynchronous task to consume messages from the queue and send them via WebSocket
    """
    if client_id not in message_queues:
        print(f"No message queue found for client {client_id}")
        return
    
    q = message_queues[client_id]
    try:
        print(f"Starting message consumer for client {client_id}")
        while True:
            try:
                # Use a non-blocking get with timeout
                try:
                    message = q.get(block=False)
                    await ws_manager.send_personal_json(message, client_id)
                    q.task_done()
                except queue.Empty:
                    # No messages, wait a bit before checking again
                    await asyncio.sleep(0.1)
                    
                    # Check if client is still connected and extraction is done
                    if (client_id not in active_extractions or 
                        active_extractions[client_id]["status"] in [STATUS_COMPLETED, STATUS_ERROR, STATUS_INTERRUPTED]):
                        # If queue is empty and extraction is done, exit the loop
                        if q.empty():
                            print(f"Consumer for {client_id} exiting - extraction complete or client disconnected")
                            if client_id in message_queues:
                                del message_queues[client_id]
                            if client_id in active_extractions:
                                del active_extractions[client_id]
                            break
                    continue
                    
            except Exception as e:
                print(f"Error in message consumer for {client_id}: {str(e)}")
                print(traceback.format_exc())
                await asyncio.sleep(1)  # Prevent tight loop on error
    except Exception as e:
        print(f"Fatal error in consumer for {client_id}: {str(e)}")
        print(traceback.format_exc())
    print(f"Message consumer for {client_id} has ended")

def send_log(client_id, log_type, message):
    """Add a log message to the client's message queue"""
    if client_id not in message_queues:
        print(f"No message queue found for client {client_id}")
        return
    
    log_entry = {
        "type": log_type,
        "message": message,
        "timestamp": datetime.datetime.utcnow().isoformat()
    }
    
    try:
        message_queues[client_id].put(log_entry)
    except Exception as e:
        print(f"Error adding log to queue for client {client_id}: {str(e)}")

def check_page_for_keywords(url, keywords, include_meta=True):
    """Check if a page contains any of the specified keywords"""
    try:
        # Initialize results
        contains_keywords = False
        found_keywords = []
        meta_info = {}
        keyword_contexts = {}
        
        # Fetch the page content
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36"
        }
        response = requests.get(url, headers=headers, timeout=15)
        response.raise_for_status()
        
        # Parse the HTML
        soup = BeautifulSoup(response.content, 'html.parser')
        
        # Extract text content
        text_content = soup.get_text(separator=' ', strip=True).lower()
        
        # Check for keywords in content
        for keyword in keywords:
            keyword_lower = keyword.lower()
            if keyword_lower in text_content:
                contains_keywords = True
                found_keywords.append(keyword)
                
                # Get context for keyword (text around the keyword)
                start_idx = text_content.find(keyword_lower)
                if start_idx != -1:
                    context_start = max(0, start_idx - 50)
                    context_end = min(len(text_content), start_idx + len(keyword) + 50)
                    context = text_content[context_start:context_end].replace('\n', ' ').strip()
                    keyword_contexts[keyword] = f"...{context}..."
        
        # If include_meta is True, check meta tags as well
        if include_meta and not contains_keywords:
            # Extract meta title
            title_tag = soup.find('title')
            if title_tag:
                title_text = title_tag.get_text().lower()
                meta_info['title'] = title_tag.get_text()
                
                # Check title for keywords
                for keyword in keywords:
                    keyword_lower = keyword.lower()
                    if keyword_lower in title_text:
                        contains_keywords = True
                        found_keywords.append(keyword)
                        keyword_contexts[keyword] = f"Title: {title_tag.get_text()}"
            
            # Check meta description and keywords
            for meta_tag in soup.find_all('meta'):
                meta_name = meta_tag.get('name', '').lower()
                meta_content = meta_tag.get('content', '').lower()
                
                if meta_name in ['description', 'keywords'] and meta_content:
                    meta_info[meta_name] = meta_tag.get('content')
                    
                    for keyword in keywords:
                        keyword_lower = keyword.lower()
                        if keyword_lower in meta_content:
                            contains_keywords = True
                            found_keywords.append(keyword)
                            keyword_contexts[keyword] = f"Meta {meta_name}: {meta_tag.get('content')}"
        
        # Remove duplicates from found_keywords
        found_keywords = list(set(found_keywords))
        
        return contains_keywords, found_keywords, meta_info, keyword_contexts
    
    except Exception as e:
        print(f"Error checking keywords for {url}: {str(e)}")
        return False, [], {}, {}

async def add_project_with_scraping(
    user_email: str, 
    url: str, 
    ws_manager: ConnectionManager = None,
    scrape_mode: str = "limited",
    pages_limit: int = 5,
    client_id: str = None,
    search_keywords: list = None,
    include_meta: bool = True,
    max_depth: int = 3  # New parameter to control crawling depth
):
    """
    Add a new project with threaded extraction, communicating progress via WebSockets.
    """
    try:
        if not url:
            raise HTTPException(status_code=400, detail="URL is required")
        
        # Always set scrape_mode to "all" and pages_limit to 0 to indicate no limit
        scrape_mode = "all"
        pages_limit = 0
        
        # Initialize variables to track processing status
        processing_status = {
            "robots_status": "not_processed",
            "sitemap_status": "not_processed",
            "pages_found": 0,
            "pages_scraped": 0,
            "errors": [],
            "extraction_status": STATUS_RUNNING,
            "start_time": datetime.datetime.utcnow().isoformat(),
            "end_time": None,
            "scrape_mode": scrape_mode,
            "pages_limit": pages_limit,
            "search_keywords": search_keywords or [],
            "include_meta": include_meta,
            "keyword_matches": {},  # Add a place to store keyword matches
            "max_depth": max_depth,  # Store the max crawling depth
            "recursive_crawling": True  # Enable recursive crawling
        }
        
        # Create project first to get project ID
        project_data = {
            "user_email": user_email,
            "url": url,
            "title": f"Project for {url}",
            "site_data": {
                "robots_id": None,
                "sitemap_pages": [url],  # Initialize with just the main URL
                "scraped_pages": [],
            },
            "processing_status": processing_status,
            "created_at": datetime.datetime.utcnow()
        }
        
        result = await projects_collection.insert_one(project_data)
        project_id = result.inserted_id
        
        # Update the user's projects array with the new project ID
        await users_collection.update_one(
            {"email": user_email},
            {"$push": {"projects": str(project_id)}}
        )
        
        # Create a unique client ID if not provided
        if not client_id:
            client_id = f"project_{str(project_id)}"
        
        # Register in active extractions with initial status
        active_extractions[client_id] = {
            "project_id": str(project_id),
            "status": STATUS_RUNNING,
            "interrupt_requested": False,
            "last_updated": datetime.datetime.utcnow()
        }
        
        # Initialize extraction statistics
        extraction_stats[client_id] = {
            "start_time": datetime.datetime.utcnow(),
            "robots_time": 0,
            "sitemap_time": 0,
            "scraping_time": 0,
            "pages_attempted": 0,
            "pages_successful": 0,
            "bytes_processed": 0,
            "total_elements_extracted": 0,
            "chunks_processed": 0
        }
        
        # Create a thread-specific message queue
        if ws_manager:
            message_queues[client_id] = queue.Queue()
            
            # Start message consumer in a separate task
            asyncio.create_task(consume_messages(client_id, ws_manager))
            
            # Send initial message to client
            await ws_manager.send_personal_json({
                "event": "project_created",
                "project_id": str(project_id),
                "status": "starting",
                "message": f"Project created. Starting extraction for {url}"
            }, client_id)
            
            # Start extraction in a separate thread with scrape preferences, search keywords, and max depth
            thread_pool.submit(
                run_extraction_thread, 
                url, 
                str(project_id), 
                client_id, 
                user_email,
                scrape_mode,
                pages_limit,
                search_keywords,
                include_meta,
                max_depth  # Pass the max depth parameter
            )
        
        return {
            "message": "Project added successfully, extraction started in background", 
            "project_id": str(project_id),
            "client_id": client_id,
            "processing_status": processing_status
        }
    except Exception as e:
        print(f"Error in add_project_with_scraping: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

def extract_links_from_html(html_content, base_url):
    """
    Extract all links from the HTML content and normalize them
    """
    try:
        soup = BeautifulSoup(html_content, 'html.parser')
        links = set()
        
        # Parse base URL for normalization
        parsed_base = urlparse(base_url)
        base_domain = parsed_base.netloc
        
        for a_tag in soup.find_all('a', href=True):
            href = a_tag['href'].strip()
            
            # Skip empty links and javascript links
            if not href or href.startswith('javascript:') or href == '#':
                continue
                
            # Normalize URL
            if href.startswith('/'):
                # Relative URL
                scheme = parsed_base.scheme or 'https'
                href = f"{scheme}://{base_domain}{href}"
            elif not (href.startswith('http://') or href.startswith('https://')):
                # Relative URL without leading slash
                if not base_url.endswith('/'):
                    href = f"{base_url}/{href}"
                else:
                    href = f"{base_url}{href}"
            
            # Only include links from the same domain
            parsed_href = urlparse(href)
            if parsed_href.netloc == base_domain or not parsed_href.netloc:
                links.add(href)
                
        return list(links)
    except Exception as e:
        print(f"Error extracting links: {e}")
        return []

def run_extraction_thread(
    url, 
    project_id, 
    client_id, 
    user_email,
    scrape_mode="limited",
    pages_limit=5,
    search_keywords=None,
    include_meta=True,
    max_depth=3
):
    """
    Run the extraction process in a separate thread with keyword filtering and recursive crawling.
    """
    print(f"Starting extraction thread for {url} with client_id {client_id}")
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    
    # Create a thread-local MongoDB client
    thread_client = AsyncIOMotorClient("mongodb://localhost:27017")
    thread_db = thread_client.hackathon
    thread_projects_collection = thread_db.projects
    
    # Track visited URLs to avoid duplicates
    visited_urls = set()
    # URLs that matched keywords (only if keywords were provided)
    keyword_matched_urls = set()
    # Queue for URLs to visit with their depth level
    url_queue = Queue()
    # Initial URL with depth 0
    url_queue.put((url, 0))
    base_domain = urlparse(url).netloc
    
    try:
        # Initialize processing status with scraping preferences and keywords
        processing_status = {
            "robots_status": "not_processed",
            "sitemap_status": "not_processed",
            "pages_found": 0,
            "pages_scraped": 0,
            "errors": [],
            "extraction_status": STATUS_RUNNING,
            "start_time": datetime.datetime.utcnow().isoformat(),
            "end_time": None,
            "scrape_mode": "all",
            "pages_limit": 0,
            "search_keywords": search_keywords or [],
            "include_meta": include_meta,
            "max_depth": max_depth
        }
        
        # Log start of extraction with search preferences
        send_log(client_id, "info", f"Starting extraction process for {url}")
        send_log(client_id, "info", f"Recursive crawling enabled with max depth {max_depth}")
        
        if search_keywords and len(search_keywords) > 0:
            send_log(client_id, "info", f"Using keyword filter: {', '.join(search_keywords)}")
            if include_meta:
                send_log(client_id, "info", "Including meta information in keyword search")
        
        # Step 1: Process robots.txt
        send_log(client_id, "info", f"Processing robots.txt for {url}")
        robots_start = time.time()
        robots = None
        try:
            robots = Robots(site=url)
            if hasattr(robots, '_id') and robots._id:
                processing_status["robots_status"] = "success"
                send_log(client_id, "success", f"Successfully processed robots.txt")
            else:
                processing_status["robots_status"] = "failed"
                processing_status["errors"].append("Failed to process robots.txt")
                send_log(client_id, "warning", f"Failed to process robots.txt, continuing anyway")
        except Exception as e:
            error_msg = f"Error in robots.txt processing: {str(e)}"
            processing_status["robots_status"] = "error"
            processing_status["errors"].append(error_msg)
            send_log(client_id, "error", error_msg)
        
        # Step 2: Process sitemap
        sitemap_start = time.time()
        sitemap_pages = [url]  # Default to just the main URL
        send_log(client_id, "info", f"Processing sitemap for {url}")
        
        try:
            sitemap = Sitemap(start_url=url)
            if hasattr(sitemap, 'page_urls') and sitemap.page_urls:
                sitemap_pages = list(sitemap.page_urls)
                processing_status["sitemap_status"] = "success"
                processing_status["pages_found"] = len(sitemap_pages)
                send_log(client_id, "success", f"Found {len(sitemap_pages)} pages in sitemap")
            else:
                processing_status["sitemap_status"] = "no_pages"
                processing_status["errors"].append("No pages found in sitemap")
                send_log(client_id, "warning", "No pages found in sitemap, starting with the base URL")
        except Exception as e:
            error_msg = f"Error in sitemap processing: {str(e)}"
            processing_status["sitemap_status"] = "error"
            processing_status["errors"].append(error_msg)
            send_log(client_id, "error", error_msg)
            send_log(client_id, "info", "Continuing with crawling from the base URL")
        
        # Step 3: Queue sitemap pages for crawling
        send_log(client_id, "info", "Queuing sitemap pages for crawling...")
        queue_count = 0
        for page_url in sitemap_pages:
            if page_url not in visited_urls:
                url_queue.put((page_url, 0))  # All sitemap pages start at depth 0
                queue_count += 1
        
        send_log(client_id, "info", f"Queued {queue_count} URLs from sitemap for crawling")
        
        # Step 4: Store keyword matches for each page
        keyword_matches = {}
        meta_info_extracted = {}
        keyword_contexts = {}
        pages_with_keywords = 0
        pages_checked = 0
        scraped_pages = []
        
        # Step 5: Process URLs recursively
        send_log(client_id, "info", f"Starting recursive crawling from {url_queue.qsize()} initial URLs")
        
        # Process URLs from queue with depth tracking
        while not url_queue.empty():
            current_url, depth = url_queue.get()
            
            # Skip if already visited
            if current_url in visited_urls:
                continue
                
            # Skip if from a different domain
            url_domain = urlparse(current_url).netloc
            if url_domain != base_domain:
                continue
            
            # Mark as visited to avoid duplicates
            visited_urls.add(current_url)
            pages_checked += 1
            
            # Log the current crawling progress
            send_log(client_id, "info", f"Crawling page {pages_checked} at depth {depth}: {current_url}")
            
            try:
                # Check for keywords if specified
                should_store = True
                if search_keywords and len(search_keywords) > 0:
                    send_log(client_id, "detail", f"Checking page for keywords: {current_url}")
                    contains_keywords, matches, meta_info, contexts = check_page_for_keywords(
                        current_url, 
                        search_keywords, 
                        include_meta
                    )
                    
                    if contains_keywords:
                        keyword_matched_urls.add(current_url)
                        keyword_matches[current_url] = matches
                        keyword_contexts[current_url] = contexts
                        meta_info_extracted[current_url] = meta_info
                        pages_with_keywords += 1
                        
                        # Log matches
                        send_log(client_id, "success", f"Page contains keywords: {', '.join(matches)}")
                        for kw, context in contexts.items():
                            send_log(client_id, "detail", f"Match '{kw}': {context[:100]}...")
                    else:
                        # Still crawl but don't store if no keywords match
                        should_store = False
                        send_log(client_id, "detail", f"No keywords found on this page")
                
                # Scrape the page to extract content and links
                send_log(client_id, "info", f"Scraping page content: {current_url}")
                scraped_data = scrape_website(current_url)
                
                # Extract links for recursive crawling if not at max depth
                if depth < max_depth:
                    # Extract links from the page content
                    page_content = scraped_data.get('raw_html', '')
                    
                    if page_content:
                        # Find and queue new links
                        new_links = extract_links_from_html(page_content, current_url)
                        new_link_count = 0
                        
                        for link in new_links:
                            if link not in visited_urls:
                                url_queue.put((link, depth + 1))
                                new_link_count += 1
                        
                        send_log(client_id, "detail", f"Found {len(new_links)} links, queued {new_link_count} new ones for depth {depth+1}")
                    else:
                        send_log(client_id, "warning", f"No HTML content to extract links from")
                else:
                    send_log(client_id, "detail", f"Max depth {max_depth} reached, not extracting further links")
                
                # Store the scraped data if needed
                if should_store:
                    # Add to the list of scraped pages
                    scraped_pages.append(current_url)
                    
                    # If we have meta information from the keyword search, add it to scraped data
                    if current_url in meta_info_extracted and meta_info_extracted[current_url]:
                        scraped_data["meta_info"] = meta_info_extracted[current_url]
                    
                    # Store scraped data in MongoDB
                    store_in_mongodb(scraped_data)
                    
                    send_log(client_id, "success", f"Successfully stored page content for {current_url}")
                    
                    # Log content stats
                    text_count = len(scraped_data.get('content', {}).get('text_content', []))
                    image_count = len(scraped_data.get('content', {}).get('images', []))
                    send_log(client_id, "detail", f"Extracted {text_count + image_count} elements ({text_count} text, {image_count} images)")
            
            except Exception as e:
                error_msg = f"Error processing {current_url}: {str(e)}"
                send_log(client_id, "error", error_msg)
                print(f"Processing exception: {error_msg}")
                print(traceback.format_exc())
                processing_status["errors"].append(error_msg)
            
            # Update processing status periodically
            processing_status["pages_found"] = len(visited_urls)
            processing_status["pages_scraped"] = len(scraped_pages)
            
            # Update the project in MongoDB periodically (every 10 pages)
            if pages_checked % 10 == 0:
                update_project_partial_sync(
                    thread_projects_collection,
                    project_id,
                    {
                        "processing_status.pages_found": len(visited_urls),
                        "processing_status.pages_scraped": len(scraped_pages)
                    }
                )
                send_log(client_id, "info", f"Progress: {len(scraped_pages)} pages scraped, {len(visited_urls)} pages found, {url_queue.qsize()} pages queued")
            
            # Check for interruption after each page
            if should_interrupt(client_id):
                send_log(client_id, "warning", f"Crawling interrupted after processing {pages_checked} pages")
                handle_interruption(client_id, loop, project_id, processing_status)
                return
        
        # Update processing status with final counts
        processing_status["pages_scraped"] = len(scraped_pages)
        processing_status["pages_found"] = len(visited_urls)
        processing_status["extraction_status"] = STATUS_COMPLETED
        processing_status["end_time"] = datetime.datetime.utcnow().isoformat()
        
        # Update project with scraped pages
        update_project_partial_sync(
            thread_projects_collection,
            project_id,
            {
                "site_data.scraped_pages": scraped_pages,
                "site_data.sitemap_pages": list(visited_urls),
                "processing_status.pages_scraped": len(scraped_pages),
                "processing_status.pages_found": len(visited_urls),
                "processing_status.extraction_status": STATUS_COMPLETED,
                "processing_status.end_time": processing_status["end_time"]
            }
        )
        
        # Final update to project with keyword match information
        if search_keywords and len(search_keywords) > 0:
            final_update = {
                "processing_status.keyword_matches": keyword_matches,
                "processing_status.keyword_contexts": keyword_contexts,
                "processing_status.pages_with_keywords": pages_with_keywords,
                "processing_status.pages_checked": pages_checked,
                "processing_status.keyword_search_performed": True
            }
            
            update_project_partial_sync(
                thread_projects_collection, 
                project_id, 
                final_update
            )
        
        send_log(client_id, "info", "Extraction process completed successfully")
        send_log(client_id, "success", f"Final results: {len(scraped_pages)} pages scraped, {len(visited_urls)} pages found")
        
        if search_keywords and len(search_keywords) > 0:
            send_log(client_id, "success", f"Found keywords on {pages_with_keywords} out of {pages_checked} pages checked")
        
        # Notify client of completion
        if client_id in message_queues:
            message_queues[client_id].put({
                "type": "completion",
                "timestamp": datetime.datetime.utcnow().isoformat(),
                "message": json.dumps({
                    "project_id": project_id,
                    "processing_status": {
                        "pages_found": processing_status["pages_found"],
                        "pages_scraped": processing_status["pages_scraped"]
                    }
                })
            })
    
    except Exception as e:
        error_msg = f"Unexpected error in extraction thread: {str(e)}"
        print(error_msg)
        print(traceback.format_exc())
        send_log(client_id, "error", error_msg)
        
        # Set error status
        if client_id in active_extractions:
            active_extractions[client_id]["status"] = STATUS_ERROR
            active_extractions[client_id]["last_updated"] = datetime.datetime.utcnow()
        
        # Update project with error status
        try:
            processing_status["extraction_status"] = STATUS_ERROR
            processing_status["end_time"] = datetime.datetime.utcnow().isoformat()
            processing_status["errors"].append(error_msg)
            update_project_partial_sync(
                thread_projects_collection,
                project_id, 
                {"processing_status": processing_status}
            )
        except Exception as e:
            print(f"Failed to update project with error status: {str(e)}")
    finally:
        # Make sure to close resources
        thread_client.close()
        loop.close()
        print(f"Extraction thread for client {client_id} has completed")
        
        # Clean up
        if client_id in extraction_stats:
            del extraction_stats[client_id]

def should_interrupt(client_id):
    """Check if an interruption has been requested for this client"""
    if client_id not in active_extractions:
        return False
    return active_extractions[client_id].get("interrupt_requested", False)

def handle_interruption(client_id, loop, project_id, processing_status):
    """Handle the interruption process"""
    if client_id not in active_extractions:
        return
    
    try:
        # Set status to interrupted
        active_extractions[client_id]["status"] = STATUS_INTERRUPTED
        active_extractions[client_id]["last_updated"] = datetime.datetime.utcnow()
        
        # Update processing status
        processing_status["extraction_status"] = STATUS_INTERRUPTED
        processing_status["end_time"] = datetime.datetime.utcnow().isoformat()
        
        # Get MongoDB client
        thread_client = AsyncIOMotorClient("mongodb://localhost:27017")
        thread_db = thread_client.hackathon
        thread_projects_collection = thread_db.projects
        
        # Update the project with interrupted status
        update_project_partial_sync(
            thread_projects_collection,
            project_id,
            {"processing_status": processing_status}
        )
        
        # Send log message
        send_log(client_id, "warning", "Extraction interrupted by user request")
        
        # Clean up
        thread_client.close()
        
        # Send completion message
        if client_id in message_queues:
            message_queues[client_id].put({
                "type": "completion",
                "timestamp": datetime.datetime.utcnow().isoformat(),
                "message": json.dumps({
                    "project_id": project_id,
                    "processing_status": {
                        "pages_found": processing_status.get("pages_found", 0),
                        "pages_scraped": processing_status.get("pages_scraped", 0),
                        "extraction_status": STATUS_INTERRUPTED
                    }
                })
            })
    except Exception as e:
        print(f"Error handling interruption: {str(e)}")
        print(traceback.format_exc())

def interrupt_extraction(client_id):
    """Send an interrupt signal to an extraction process"""
    if client_id not in active_extractions:
        return False
    
    active_extractions[client_id]["interrupt_requested"] = True
    active_extractions[client_id]["last_updated"] = datetime.datetime.utcnow()
    print(f"Interrupt requested for client {client_id}")
    return True

def get_extraction_status(client_id):
    """Get the current status of an extraction process"""
    if client_id not in active_extractions:
        return None
    
    status = active_extractions[client_id].copy()
    
    # Add additional stats if available
    if client_id in extraction_stats:
        status["stats"] = extraction_stats[client_id]
    
    return status

def update_project_partial_sync(collection, project_id, update_data):
    """Update a project with partial data in a synchronous way"""
    try:
        # Create a sync client to avoid asyncio issues in threads
        client = MongoClient("mongodb://localhost:27017")
        db = client.hackathon
        
        # Get the collection
        coll = db[collection.name]
        
        # Build the update document
        update_doc = {}
        for key, value in update_data.items():
            if "." in key:
                # Handle nested fields with dot notation
                update_doc[key] = value
            else:
                # Handle top-level fields
                update_doc[key] = value
        
        # Update the document
        coll.update_one({"_id": ObjectId(project_id)}, {"$set": update_doc})
        
        # Close the client
        client.close()
        
    except Exception as e:
        print(f"Error updating project: {str(e)}")
        print(traceback.format_exc())

def update_project_array_sync(collection, project_id, array_field, items):
    """Update a project array field by adding items in a synchronous way"""
    try:
        # Create a sync client to avoid asyncio issues in threads
        client = MongoClient("mongodb://localhost:27017")
        db = client.hackathon
        
        # Get the collection
        coll = db[collection.name]
        
        # Update the document by pushing to the array
        coll.update_one(
            {"_id": ObjectId(project_id)}, 
            {"$push": {array_field: {"$each": items}}}
        )
        
        # Close the client
        client.close()
        
    except Exception as e:
        print(f"Error updating project array: {str(e)}")
        print(traceback.format_exc())
