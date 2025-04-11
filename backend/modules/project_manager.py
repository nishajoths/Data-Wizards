from scraper.robots import Robots
from scraper.sitemap import Sitemap
from scraper.site import scrape_website, store_in_mongodb
from motor.motor_asyncio import AsyncIOMotorClient
from fastapi import HTTPException
import datetime
from bson import ObjectId
import traceback

client = AsyncIOMotorClient("mongodb://localhost:27017")
db = client.hackathon
projects_collection = db.projects
users_collection = db.users

async def add_project_with_scraping(user_email: str, url: str):
    try:
        if not url:
            raise HTTPException(status_code=400, detail="URL is required")
        
        # Initialize variables to track processing status
        processing_status = {
            "robots_status": "not_processed",
            "sitemap_status": "not_processed",
            "pages_found": 0,
            "pages_scraped": 0,
            "errors": []
        }
        
        # Step 1: Process robots.txt
        robots = None
        try:
            print(f"Processing robots.txt for URL: {url}")
            robots = Robots(site=url)
            if hasattr(robots, '_id') and robots._id:
                processing_status["robots_status"] = "success"
            else:
                processing_status["robots_status"] = "failed"
                processing_status["errors"].append("Failed to process robots.txt")
        except Exception as e:
            error_msg = f"Error in robots.txt processing: {str(e)}"
            print(error_msg)
            processing_status["robots_status"] = "error"
            processing_status["errors"].append(error_msg)
        
        # Step 2: Process sitemap
        sitemap_pages = [url]  # Default to just the main URL
        try:
            print(f"Processing sitemap for URL: {url}")
            sitemap = Sitemap(start_url=url)
            if hasattr(sitemap, 'page_urls') and sitemap.page_urls:
                sitemap_pages = list(sitemap.page_urls)
                processing_status["sitemap_status"] = "success"
                processing_status["pages_found"] = len(sitemap_pages)
            else:
                processing_status["sitemap_status"] = "no_pages"
                processing_status["errors"].append("No pages found in sitemap")
        except Exception as e:
            error_msg = f"Error in sitemap processing: {str(e)}"
            print(error_msg)
            print(traceback.format_exc())
            processing_status["sitemap_status"] = "error"
            processing_status["errors"].append(error_msg)
        
        # Step 3: Scrape pages (up to 5)
        scraped_pages = []
        page_limit = min(5, len(sitemap_pages))
        
        print(f"Found {len(sitemap_pages)} pages, will scrape up to {page_limit}")
        
        for page_url in sitemap_pages[:page_limit]:
            if not page_url.endswith(".xml"):  # Skip XML links
                try:
                    print(f"Scraping page: {page_url}")
                    scraped_data = scrape_website(page_url)
                    if "error" not in scraped_data:
                        store_in_mongodb(scraped_data)
                        scraped_pages.append(page_url)
                    else:
                        processing_status["errors"].append(f"Error scraping {page_url}: {scraped_data['error']}")
                except Exception as e:
                    error_msg = f"Error scraping {page_url}: {str(e)}"
                    print(error_msg)
                    processing_status["errors"].append(error_msg)
        
        processing_status["pages_scraped"] = len(scraped_pages)
        
        # Step 4: Store project in database (even if we had errors)
        project_data = {
            "user_email": user_email,
            "url": url,
            "title": f"Project for {url}",
            "site_data": {
                "robots_id": str(robots._id) if robots and hasattr(robots, '_id') else None,
                "sitemap_pages": sitemap_pages,
                "scraped_pages": scraped_pages,
            },
            "processing_status": processing_status,
            "created_at": datetime.datetime.utcnow()
        }
        
        print(f"Storing project in database with status: {processing_status}")
        result = await projects_collection.insert_one(project_data)
        project_id = result.inserted_id
        
        # Update the user's projects array with the new project ID
        await users_collection.update_one(
            {"email": user_email},
            {"$push": {"projects": str(project_id)}}
        )
        
        return {
            "message": "Project added successfully", 
            "project_id": str(project_id),
            "processing_status": processing_status
        }
    except Exception as e:
        print(f"Error in add_project_with_scraping: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")
