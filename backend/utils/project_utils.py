from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorClient
from utils.mongodb_utils import serialize_mongo_doc

client = AsyncIOMotorClient("mongodb://localhost:27017")
db = client.hackathon

async def get_complete_project_data(project_id: str, user_email: str):
    """Fetch complete project data including all related information"""
    # Get the base project
    project = await db.projects.find_one({"_id": ObjectId(project_id), "user_email": user_email})
    if not project:
        return None
    
    # Fetch robots.txt data if available
    robots_data = None
    if project.get("site_data", {}).get("robots_id"):
        try:
            robots_data = await db.robots.find_one({"_id": ObjectId(project["site_data"]["robots_id"])})
        except Exception as e:
            print(f"Error fetching robots data: {e}")
    
    # Fetch page content for scraped pages
    scraped_content = []
    for page_url in project.get("site_data", {}).get("scraped_pages", [])[:5]:  # Limit to 5 pages
        try:
            page_data = await db.sites.find_one({"url": page_url})
            if page_data:
                scraped_content.append(page_data)
        except Exception as e:
            print(f"Error fetching page content for {page_url}: {e}")
    
    # Assemble complete project data
    complete_data = {
        **project,
        "related_data": {
            "robots_data": robots_data,
            "scraped_content": scraped_content
        }
    }
    
    return serialize_mongo_doc(complete_data)
