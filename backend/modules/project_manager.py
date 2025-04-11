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
import json
import uuid
import time
import math
from utils.websocket_manager import ConnectionManager

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

async def add_project_with_scraping(
    user_email: str, 
    url: str, 
    ws_manager: ConnectionManager = None,
    scrape_mode: str = "limited",
    pages_limit: int = 5
):
    """
    Add a new project with threaded extraction, communicating progress via WebSockets.
    """
    try:
        if not url:
            raise HTTPException(status_code=400, detail="URL is required")
        
        # Validate scrape_mode
        if scrape_mode not in ["all", "limited"]:
            scrape_mode = "limited"  # Default to limited if invalid value
            
        # Validate pages_limit
        if pages_limit < 1:
            pages_limit = 5  # Set a reasonable default
        elif scrape_mode == "limited" and pages_limit > 100:
            pages_limit = 100  # Cap at 100 pages for limited mode to prevent excessive scraping
        
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
            "pages_limit": pages_limit
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
        
        # Generate a unique client ID for WebSocket communication
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
            
            # Start extraction in a separate thread with scrape preferences
            thread_pool.submit(
                run_extraction_thread, 
                url, 
                str(project_id), 
                client_id, 
                user_email,
                scrape_mode,
                pages_limit
            )
            
            await ws_manager.send_personal_json({
                "event": "project_created",
                "project_id": str(project_id),
                "status": "starting",
                "message": f"Project created. Starting extraction for {url}"
            }, client_id)
        
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

def run_extraction_thread(
    url, 
    project_id, 
    client_id, 
    user_email,
    scrape_mode="limited",
    pages_limit=5
):
    """
    Run the extraction process in a separate thread with interrupt capability and detailed logging.
    This function is executed in a ThreadPoolExecutor.
    """
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    
    # Create a thread-local MongoDB client
    thread_client = AsyncIOMotorClient("mongodb://localhost:27017")
    thread_db = thread_client.hackathon
    thread_projects_collection = thread_db.projects
    
    try:
        # Initialize processing status with scraping preferences
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
            "pages_limit": pages_limit
        }
        
        # Log start of extraction with scraping preferences
        send_log(client_id, "info", f"Starting extraction process for {url}")
        send_log(client_id, "info", f"Extraction running in background thread (ID: {client_id})")
        
        if scrape_mode == "all":
            send_log(client_id, "info", f"Scraping mode: ALL pages will be scraped (this could take a while)")
        else:
            send_log(client_id, "info", f"Scraping mode: LIMITED to {pages_limit} pages")
        
        # Check if extraction should be interrupted before each major step
        if should_interrupt(client_id):
            send_log(client_id, "warning", "Extraction interrupted before starting")
            handle_interruption(client_id, loop, project_id, processing_status)
            return
        
        # Step 1: Process robots.txt
        send_log(client_id, "info", f"Processing robots.txt for {url}")
        robots_start = time.time()
        robots = None
        try:
            robots = Robots(site=url)
            if hasattr(robots, '_id') and robots._id:
                processing_status["robots_status"] = "success"
                extraction_stats[client_id]["robots_time"] = time.time() - robots_start
                send_log(client_id, "success", f"Successfully processed robots.txt")
                send_log(client_id, "detail", f"Found {len(robots.rules)} rules and {len(robots.sitemap_urls)} sitemap URLs in robots.txt")

                # Update project with robots.txt data
                update_project_partial_sync(
                    thread_projects_collection,
                    project_id,
                    {
                        "site_data.robots_id": str(robots._id),
                        "site_data.robots_rules": robots.rules,
                        "site_data.sitemap_urls": robots.sitemap_urls
                    }
                )
            else:
                processing_status["robots_status"] = "failed"
                processing_status["errors"].append("Failed to process robots.txt")
                send_log(client_id, "error", f"Failed to process robots.txt")
        except Exception as e:
            error_msg = f"Error in robots.txt processing: {str(e)}"
            processing_status["robots_status"] = "error"
            processing_status["errors"].append(error_msg)
            send_log(client_id, "error", error_msg)
        
        # Check if extraction should be interrupted after robots.txt
        if should_interrupt(client_id):
            send_log(client_id, "warning", "Extraction interrupted after robots.txt processing")
            handle_interruption(client_id, loop, project_id, processing_status)
            return
        
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
                extraction_stats[client_id]["sitemap_time"] = time.time() - sitemap_start
                send_log(client_id, "success", f"Found {len(sitemap_pages)} pages in sitemap")

                # Update project with sitemap data
                update_project_partial_sync(
                    thread_projects_collection,
                    project_id,
                    {
                        "site_data.sitemap_pages": sitemap_pages
                    }
                )
            else:
                processing_status["sitemap_status"] = "no_pages"
                processing_status["errors"].append("No pages found in sitemap")
                send_log(client_id, "warning", "No pages found in sitemap")
        except Exception as e:
            error_msg = f"Error in sitemap processing: {str(e)}"
            processing_status["sitemap_status"] = "error"
            processing_status["errors"].append(error_msg)
            send_log(client_id, "error", error_msg)
        
        # Update database with sitemap results - using chunking
        if len(sitemap_pages) > CHUNK_SIZE:
            send_log(client_id, "info", f"Breaking sitemap data into {math.ceil(len(sitemap_pages)/CHUNK_SIZE)} chunks for processing")
            # Update with just the count first
            update_project_partial_sync(
                thread_projects_collection, 
                project_id, 
                {
                    "processing_status.sitemap_status": processing_status["sitemap_status"],
                    "processing_status.pages_found": processing_status["pages_found"],
                    "processing_status.errors": processing_status["errors"]
                }
            )
            
            # Update sitemap pages in chunks
            for i in range(0, len(sitemap_pages), CHUNK_SIZE):
                if should_interrupt(client_id):
                    send_log(client_id, "warning", f"Interrupted while updating sitemap chunk {i//CHUNK_SIZE + 1}/{math.ceil(len(sitemap_pages)/CHUNK_SIZE)}")
                    handle_interruption(client_id, loop, project_id, processing_status)
                    return
                
                chunk = sitemap_pages[i:i+CHUNK_SIZE]
                send_log(client_id, "detail", f"Updating sitemap chunk {i//CHUNK_SIZE + 1}/{math.ceil(len(sitemap_pages)/CHUNK_SIZE)} ({len(chunk)} pages)")
                
                try:
                    # Use array operations for efficiency
                    update_project_array_sync(
                        thread_projects_collection,
                        project_id,
                        "site_data.sitemap_pages",
                        chunk
                    )
                    extraction_stats[client_id]["chunks_processed"] += 1
                    send_log(client_id, "success", f"Updated sitemap chunk {i//CHUNK_SIZE + 1}")
                except Exception as e:
                    error_msg = f"Error updating sitemap chunk: {str(e)}"
                    processing_status["errors"].append(error_msg)
                    send_log(client_id, "error", error_msg)
        else:
            # Small enough to update at once
            update_project_partial_sync(
                thread_projects_collection, 
                project_id, 
                {
                    "site_data.sitemap_pages": sitemap_pages,
                    "processing_status.sitemap_status": processing_status["sitemap_status"],
                    "processing_status.pages_found": processing_status["pages_found"],
                    "processing_status.errors": processing_status["errors"]
                }
            )
        
        # Check if extraction should be interrupted after sitemap
        if should_interrupt(client_id):
            send_log(client_id, "warning", "Extraction interrupted after sitemap processing")
            handle_interruption(client_id, loop, project_id, processing_status)
            return
        
        # Step 3: Scrape pages - now with configurable limits
        scraping_start = time.time()
        scraped_pages = []
        
        # Add network metrics aggregation
        network_stats = {
            "total_size_bytes": 0,
            "total_duration_ms": 0,
            "pages_with_metrics": 0,
            "avg_speed_kbps": 0,
            "fastest_page": {"url": None, "speed_kbps": 0},
            "slowest_page": {"url": None, "speed_kbps": float('inf')},
            "total_requests": 0
        }
        
        # Determine number of pages to scrape based on scrape_mode
        if scrape_mode == "all":
            page_limit = len(sitemap_pages)
            send_log(client_id, "info", f"Will scrape ALL {page_limit} pages")
        else:
            page_limit = min(pages_limit, len(sitemap_pages))
            send_log(client_id, "info", f"Found {len(sitemap_pages)} pages, will scrape up to {page_limit} (limited mode)")
        
        for i, page_url in enumerate(sitemap_pages[:page_limit]):
            # Check for interruption before each page
            if should_interrupt(client_id):
                send_log(client_id, "warning", f"Extraction interrupted after scraping {i} pages")
                handle_interruption(client_id, loop, project_id, processing_status)
                return
            
            extraction_stats[client_id]["pages_attempted"] += 1
            
            if not page_url.endswith(".xml"):  # Skip XML links
                try:
                    send_log(client_id, "info", f"Scraping page {i+1}/{page_limit}: {page_url}")
                    scrape_start_time = time.time()
                    scraped_data = scrape_website(page_url)
                    
                    if "error" not in scraped_data:
                        # Count elements for detailed logging
                        text_count = len(scraped_data.get("content", {}).get("text_content", []))
                        image_count = len(scraped_data.get("content", {}).get("images", []))
                        image_text_count = len(scraped_data.get("content", {}).get("image_texts", []))
                        total_elements = text_count + image_count + image_text_count
                        
                        # Estimate size of scraped data
                        data_size = len(json.dumps(scraped_data))
                        extraction_stats[client_id]["bytes_processed"] += data_size
                        extraction_stats[client_id]["total_elements_extracted"] += total_elements
                        
                        # Log detailed extraction info
                        scrape_time = time.time() - scrape_start_time
                        send_log(client_id, "detail", f"Extracted {total_elements} elements ({text_count} text, {image_count} images, {image_text_count} image texts)")
                        send_log(client_id, "detail", f"Page size: {data_size/1024:.1f} KB, took {scrape_time:.2f} seconds")
                        
                        # Process network metrics
                        if "network_metrics" in scraped_data:
                            metrics = scraped_data["network_metrics"]
                            
                            # Log network performance
                            duration_ms = metrics.get("duration_ms", 0)
                            size_kb = metrics.get("content_size_bytes", 0) / 1024
                            speed_kbps = metrics.get("speed_kbps", 0)
                            
                            send_log(client_id, "network", 
                                f"Page loaded in {duration_ms}ms | Size: {size_kb:.1f}KB | " +
                                f"Speed: {speed_kbps:.1f}KB/s")
                            
                            # Update aggregated stats
                            network_stats["total_size_bytes"] += metrics.get("content_size_bytes", 0)
                            network_stats["total_duration_ms"] += metrics.get("duration_ms", 0)
                            network_stats["pages_with_metrics"] += 1
                            network_stats["total_requests"] += 1
                            
                            # Track fastest and slowest pages
                            if speed_kbps > network_stats["fastest_page"]["speed_kbps"]:
                                network_stats["fastest_page"] = {
                                    "url": page_url,
                                    "speed_kbps": speed_kbps
                                }
                            
                            if speed_kbps < network_stats["slowest_page"]["speed_kbps"]:
                                network_stats["slowest_page"] = {
                                    "url": page_url,
                                    "speed_kbps": speed_kbps
                                }
                        
                        store_in_mongodb(scraped_data)
                        scraped_pages.append(page_url)
                        extraction_stats[client_id]["pages_successful"] += 1
                        send_log(client_id, "success", f"Successfully scraped {page_url}")
                        
                        # Update progress after each page
                        processing_status["pages_scraped"] = len(scraped_pages)
                        
                        # Update the project with new page only - avoids large updates
                        update_project_array_sync(
                            thread_projects_collection, 
                            project_id, 
                            "site_data.scraped_pages",
                            [page_url]
                        )
                        
                        update_project_partial_sync(
                            thread_projects_collection, 
                            project_id, 
                            {
                                "processing_status.pages_scraped": len(scraped_pages)
                            }
                        )
                        
                    else:
                        error_msg = f"Error scraping {page_url}: {scraped_data['error']}"
                        processing_status["errors"].append(error_msg)
                        send_log(client_id, "error", error_msg)
                        
                        # Try to extract network metrics even on error
                        if "network_metrics" in scraped_data:
                            metrics = scraped_data["network_metrics"]
                            send_log(client_id, "network", 
                                f"Failed page loaded in {metrics.get('duration_ms', 0)}ms | " +
                                f"Status: {metrics.get('status_code', 'unknown')}")
                except Exception as e:
                    error_msg = f"Error scraping {page_url}: {str(e)}"
                    processing_status["errors"].append(error_msg)
                    send_log(client_id, "error", error_msg)
        
        extraction_stats[client_id]["scraping_time"] = time.time() - scraping_start
        processing_status["pages_scraped"] = len(scraped_pages)
        
        # After all pages are scraped, calculate averages and log summary
        if network_stats["pages_with_metrics"] > 0:
            network_stats["avg_speed_kbps"] = (network_stats["total_size_bytes"] / 1024) / (network_stats["total_duration_ms"] / 1000)
            
            # Log network performance summary
            send_log(client_id, "detail", f"Network Performance Summary:")
            send_log(client_id, "detail", f"Average speed: {network_stats['avg_speed_kbps']:.1f}KB/s")
            send_log(client_id, "detail", f"Total transferred: {network_stats['total_size_bytes']/1024/1024:.2f}MB")
            send_log(client_id, "detail", f"Total load time: {network_stats['total_duration_ms']/1000:.2f}s")
            
            if network_stats["fastest_page"]["url"]:
                fast_url = network_stats["fastest_page"]["url"]
                fast_speed = network_stats["fastest_page"]["speed_kbps"]
                send_log(client_id, "detail", f"Fastest page: {fast_url} ({fast_speed:.1f}KB/s)")
            
            if network_stats["slowest_page"]["url"]:
                slow_url = network_stats["slowest_page"]["url"]
                slow_speed = network_stats["slowest_page"]["speed_kbps"]
                send_log(client_id, "detail", f"Slowest page: {slow_url} ({slow_speed:.1f}KB/s)")
            
            # Store network stats in the project
            processing_status["network_stats"] = network_stats
        
        # Final update to project
        robots_id = str(robots._id) if robots and hasattr(robots, '_id') else None
        processing_status["extraction_status"] = STATUS_COMPLETED
        processing_status["end_time"] = datetime.datetime.utcnow().isoformat()
        
        # Calculate overall extraction statistics
        total_time = time.time() - extraction_stats[client_id]["start_time"].timestamp()
        send_log(client_id, "detail", f"Extraction completed in {total_time:.2f} seconds")
        send_log(client_id, "detail", f"Robots: {extraction_stats[client_id]['robots_time']:.2f}s, " +
                               f"Sitemap: {extraction_stats[client_id]['sitemap_time']:.2f}s, " +
                               f"Scraping: {extraction_stats[client_id]['scraping_time']:.2f}s")
        
        if extraction_stats[client_id]["pages_attempted"] > 0:
            success_rate = (extraction_stats[client_id]["pages_successful"] / extraction_stats[client_id]["pages_attempted"]) * 100
            send_log(client_id, "detail", f"Scraping success rate: {success_rate:.1f}% ({extraction_stats[client_id]['pages_successful']}/{extraction_stats[client_id]['pages_attempted']})")
        
        # Format processed data nicely
        processed_mb = extraction_stats[client_id]["bytes_processed"] / (1024 * 1024)
        send_log(client_id, "detail", f"Processed {processed_mb:.2f} MB of data")
        send_log(client_id, "detail", f"Total elements extracted: {extraction_stats[client_id]['total_elements_extracted']}")
        
        final_update = {
            "site_data.robots_id": robots_id,
            "processing_status": processing_status
        }
        
        update_project_partial_sync(
            thread_projects_collection, 
            project_id, 
            final_update
        )
        
        # Notify completion
        send_log(client_id, "info", "Extraction process completed")
        send_log(client_id, "completion", json.dumps({
            "project_id": project_id,
            "processing_status": processing_status
        }))
        
        # Update extraction status
        active_extractions[client_id]["status"] = STATUS_COMPLETED
        active_extractions[client_id]["last_updated"] = datetime.datetime.utcnow()
        
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
        except:
            print("Failed to update project with error status")
    finally:
        loop.close()
        thread_client.close()
        # Clean up
        if client_id in extraction_stats:
            del extraction_stats[client_id]

def handle_interruption(client_id, loop, project_id, processing_status):
    """Handle graceful interruption of extraction process"""
    processing_status["extraction_status"] = STATUS_INTERRUPTED
    processing_status["end_time"] = datetime.datetime.utcnow().isoformat()
    processing_status["errors"].append("Extraction was manually interrupted")
    
    # Create a thread-local MongoDB client
    thread_client = AsyncIOMotorClient("mongodb://localhost:27017")
    thread_db = thread_client.hackathon
    thread_projects_collection = thread_db.projects
    
    # Update project with interrupted status
    try:
        update_project_partial_sync(
            thread_projects_collection,
            project_id, 
            {"processing_status": processing_status}
        )
    except Exception as e:
        print(f"Error updating project with interrupted status: {e}")
    finally:
        thread_client.close()
    
    # Update extraction status
    if client_id in active_extractions:
        active_extractions[client_id]["status"] = STATUS_INTERRUPTED
        active_extractions[client_id]["last_updated"] = datetime.datetime.utcnow()
    
    # Send notification
    send_log(client_id, "warning", "Extraction was interrupted by user request")
    send_log(client_id, "completion", json.dumps({
        "project_id": project_id,
        "processing_status": processing_status
    }))

def should_interrupt(client_id):
    """Check if extraction should be interrupted"""
    if client_id in active_extractions:
        return active_extractions[client_id].get("interrupt_requested", False)
    return False

def interrupt_extraction(client_id):
    """Set flag to interrupt extraction process"""
    if client_id in active_extractions:
        active_extractions[client_id]["interrupt_requested"] = True
        active_extractions[client_id]["last_updated"] = datetime.datetime.utcnow()
        return True
    return False

def get_extraction_status(client_id):
    """Get current extraction status"""
    if client_id in active_extractions:
        return active_extractions[client_id]
    return None

def send_log(client_id, log_type, message):
    """Send a log message to the WebSocket queue"""
    if client_id in message_queues:
        log_entry = {
            "type": log_type,
            "timestamp": datetime.datetime.utcnow().isoformat(),
            "message": message
        }
        message_queues[client_id].put(log_entry)

async def update_project_partial(project_id, update_data, loop=None):
    """Update specific fields in the project document"""
    try:
        # Convert string ID to ObjectId if needed
        if isinstance(project_id, str):
            project_id = ObjectId(project_id)
            
        # Create the update with $set
        update = {"$set": {}}
        for key, value in update_data.items():
            update["$set"][key] = value
            
        # Simply await the operation directly
        return await projects_collection.update_one({"_id": project_id}, update)
    except Exception as e:
        print(f"Error updating project: {str(e)}")
        print(traceback.format_exc())
        raise e

async def update_project_array(project_id, array_field, items, loop=None):
    """Update an array field in the project document using $push with $each"""
    try:
        # Convert string ID to ObjectId if needed
        if isinstance(project_id, str):
            project_id = ObjectId(project_id)
            
        # Create the update operation
        update_operation = {"$push": {array_field: {"$each": items}}}
        
        # Simply await the operation directly
        return await projects_collection.update_one({"_id": project_id}, update_operation)
    except Exception as e:
        print(f"Error updating project array: {str(e)}")
        print(traceback.format_exc())
        raise e

def update_project_partial_sync(collection, project_id, update_data):
    """Synchronous version for use in thread context"""
    try:
        # Convert string ID to ObjectId if needed
        if isinstance(project_id, str):
            project_id = ObjectId(project_id)
            
        # Create the update with $set
        update = {"$set": {}}
        for key, value in update_data.items():
            update["$set"][key] = value
            
        # Use the synchronous operations (blocking)
        return collection.update_one({"_id": project_id}, update)
    except Exception as e:
        print(f"Error updating project (sync): {str(e)}")
        print(traceback.format_exc())
        raise e

def update_project_array_sync(collection, project_id, array_field, items):
    """Synchronous version for use in thread context"""
    try:
        # Convert string ID to ObjectId if needed
        if isinstance(project_id, str):
            project_id = ObjectId(project_id)
            
        # Create the update operation
        update_operation = {"$push": {array_field: {"$each": items}}}
        
        # Use the synchronous operations (blocking)
        return collection.update_one({"_id": project_id}, update_operation)
    except Exception as e:
        print(f"Error updating project array (sync): {str(e)}")
        print(traceback.format_exc())
        raise e

async def consume_messages(client_id, ws_manager):
    """
    Asynchronous task to consume messages from the queue and send them via WebSocket
    """
    if client_id not in message_queues:
        return
    
    q = message_queues[client_id]
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
                        if client_id in message_queues:
                            del message_queues[client_id]
                        if client_id in active_extractions:
                            del active_extractions[client_id]
                        break
                continue
                
        except Exception as e:
            print(f"Error in message consumer for {client_id}: {str(e)}")
            await asyncio.sleep(1)  # Prevent tight loop on error
