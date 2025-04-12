from fastapi import APIRouter, HTTPException, Depends, Body
from typing import List, Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel
from bson import ObjectId
import traceback
from auth.auth import get_current_user
import html2text
from utils.mongodb_utils import serialize_mongo_doc  # Add this import

router = APIRouter()

class ExtensionProject(BaseModel):
    project_id: str
    user_id: str
    user_email: str
    url: str
    name: str
    description: Optional[str] = None
    card_selector: str
    pagination_selector: Optional[str] = None
    created_at: str
    status: str = "in_progress"
    cards_extracted: int = 0
    pages_scraped: int = 0

class ExtractedItem(BaseModel):
    text: str
    html: str
    links: List[str] = []
    images: List[str] = []
    url: str
    page_number: int
    structured_data: Optional[Dict[str, Any]] = {}
    title: Optional[str] = None

@router.get("/extension-projects")
async def get_extension_projects(current_user = Depends(get_current_user)):
    """Get all extension projects for the current user"""
    try:
        # Access MongoDB from the app's state
        from main import db
        
        cursor = db.extension_projects.find({"user_email": current_user["email"]})
        projects = await cursor.to_list(length=100)
        
        # Use our serialization function for all projects
        return {"projects": [serialize_mongo_doc(project) for project in projects]}
    except Exception as e:
        print(f"Error getting extension projects: {e}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/extension-projects/{project_id}")
async def get_extension_project(project_id: str, current_user = Depends(get_current_user)):
    """Get a specific extension project by ID"""
    try:
        from main import db
        
        # Find the project
        project = await db.extension_projects.find_one({
            "project_id": project_id,
            "user_email": current_user["email"]
        })
        
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        # Get all extracted data for this project
        extracted_items_cursor = db.extension_extracted_data.find({"project_id": project_id})
        extracted_items = await extracted_items_cursor.to_list(length=1000)
        
        # Serialize the project
        serialized_project = serialize_mongo_doc(project)
        
        # Process and attach extracted items to the project
        if extracted_items:
            serialized_project["extracted_data"] = []
            
            for item in extracted_items:
                serialized_item = serialize_mongo_doc(item)
                
                # Extract title from HTML if not already present
                if not serialized_item.get("title"):
                    try:
                        h = html2text.HTML2Text()
                        h.ignore_links = True
                        text = h.handle(serialized_item["html"])
                        lines = text.strip().split('\n')
                        if lines:
                            serialized_item["title"] = lines[0][:100]  # First line, limited to 100 chars
                    except:
                        pass
                
                serialized_project["extracted_data"].append(serialized_item)
        else:
            serialized_project["extracted_data"] = []
        
        return serialized_project
        
    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"Error getting extension project: {e}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/extension-projects")
async def create_extension_project(project: ExtensionProject, current_user = Depends(get_current_user)):
    """Create a new extension project"""
    try:
        from main import db
        
        # Verify user info
        if current_user["email"] != project.user_email:
            raise HTTPException(status_code=403, detail="User email doesn't match authenticated user")
        
        # Set creation time if not set
        if not project.created_at:
            project.created_at = datetime.utcnow().isoformat()
        
        # Convert to dict for insertion
        project_dict = project.dict()
        project_dict["updated_at"] = datetime.utcnow().isoformat()
        
        # Insert into MongoDB
        result = await db.extension_projects.insert_one(project_dict)
        
        return {"success": True, "project_id": project.project_id}
    
    except Exception as e:
        print(f"Error creating extension project: {e}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/extension-projects/{project_id}/data")
async def add_extracted_data(
    project_id: str, 
    items: List[ExtractedItem] = Body(...),
    current_user = Depends(get_current_user)
):
    """Add extracted data to an extension project"""
    try:
        from main import db
        
        # Check if project exists and belongs to user
        project = await db.extension_projects.find_one({
            "project_id": project_id,
            "user_email": current_user["email"]
        })
        
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        # Add the extracted data
        items_to_insert = [item.dict() for item in items]
        
        # Add timestamp and project_id to each item
        for item in items_to_insert:
            item["project_id"] = project_id
            item["user_id"] = current_user["_id"]
            item["timestamp"] = datetime.utcnow().isoformat()
            
            # Try to determine a title if not present
            if not item.get("title"):
                try:
                    # Extract first line or heading from text
                    text_lines = item["text"].strip().split('\n')
                    if text_lines:
                        item["title"] = text_lines[0][:100]  # First line, limited to 100 chars
                except:
                    pass
            
            # Process HTML to extract structured data
            try:
                if not item.get("structured_data"):
                    item["structured_data"] = extract_structured_data(item["html"])
            except:
                item["structured_data"] = {}
        
        # Insert data into a separate collection
        await db.extension_extracted_data.insert_many(items_to_insert)
        
        # Also store in sites collection to link with other system components
        sites_items = []
        for item in items_to_insert:
            site_item = {
                "url": item["url"],
                "title": item.get("title", ""),
                "content": item["text"],
                "html": item["html"],
                "links": item["links"],
                "images": item["images"],
                "structured_data": item["structured_data"],
                "timestamp": item["timestamp"],
                "project_id": project_id,
                "extension_data": True,  # Mark as extension data
                "user_id": str(current_user["_id"]),
                "page_number": item.get("page_number", 1)
            }
            sites_items.append(site_item)
        
        if sites_items:
            await db.sites.insert_many(sites_items)
        
        # Update project stats
        await db.extension_projects.update_one(
            {"project_id": project_id},
            {
                "$inc": {"cards_extracted": len(items)},
                "$set": {"status": "in_progress", "updated_at": datetime.utcnow().isoformat()}
            }
        )
        
        return {"success": True, "items_added": len(items)}
    except Exception as e:
        print(f"Error adding extracted data: {e}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/extension-projects/{project_id}/status")
async def update_project_status(
    project_id: str,
    status_update: dict = Body(...),
    current_user = Depends(get_current_user)
):
    """Update the status of an extension project"""
    try:
        from main import db
        
        # Check if project exists and belongs to user
        project = await db.extension_projects.find_one({
            "project_id": project_id,
            "user_email": current_user["email"]
        })
        
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        # Update status and other fields
        update_data = {
            "status": status_update.get("status", "in_progress"),
            "updated_at": datetime.utcnow().isoformat()
        }
        
        if "pages_scraped" in status_update:
            update_data["pages_scraped"] = status_update["pages_scraped"]
        
        await db.extension_projects.update_one(
            {"project_id": project_id},
            {"$set": update_data}
        )
        
        return {"success": True, "project_id": project_id, "status": update_data["status"]}
    except Exception as e:
        print(f"Error updating project status: {e}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))

def extract_structured_data(html: str) -> Dict[str, Any]:
    """Extract structured data from HTML (prices, dates, etc.)"""
    structured_data = {}
    
    try:
        from bs4 import BeautifulSoup
        import re
        
        soup = BeautifulSoup(html, 'html.parser')
        
        # Extract prices
        price_patterns = [
            r'\$\d+(?:\.\d{1,2})?',  # $XX.XX
            r'USD\s*\d+(?:\.\d{1,2})?',  # USD XX.XX
            r'€\d+(?:\.\d{1,2})?',  # €XX.XX
            r'£\d+(?:\.\d{1,2})?',  # £XX.XX
            r'\d+(?:\.\d{1,2})?\s*(?:USD|EUR|GBP)'  # XX.XX USD/EUR/GBP
        ]
        
        # Check for price patterns in text
        text_content = soup.get_text()
        prices = []
        for pattern in price_patterns:
            matches = re.findall(pattern, text_content)
            if matches:
                prices.extend(matches)
        
        if prices:
            structured_data['prices'] = prices
        
        # Extract dates
        date_patterns = [
            r'\d{1,2}/\d{1,2}/\d{2,4}',  # MM/DD/YYYY or DD/MM/YYYY
            r'\d{1,2}-\d{1,2}-\d{2,4}',  # MM-DD-YYYY or DD-MM-YYYY
            r'\d{4}-\d{1,2}-\d{1,2}',    # YYYY-MM-DD (ISO format)
        ]
        
        dates = []
        for pattern in date_patterns:
            matches = re.findall(pattern, text_content)
            if matches:
                dates.extend(matches)
                
        if dates:
            structured_data['dates'] = dates
        
        # Extract headings
        headings = []
        for tag in soup.find_all(['h1', 'h2', 'h3', 'h4']):
            headings.append({
                'level': int(tag.name[1]),
                'text': tag.get_text().strip()
            })
            
        if headings:
            structured_data['headings'] = headings
            
            # Use first heading as title if present
            if headings and not structured_data.get('title'):
                structured_data['title'] = headings[0]['text']
        
    except Exception as e:
        print(f"Error extracting structured data: {e}")
        
    return structured_data
