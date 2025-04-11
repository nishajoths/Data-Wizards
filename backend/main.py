from fastapi import FastAPI, HTTPException, Depends, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.responses import JSONResponse, HTMLResponse
from pydantic import BaseModel, EmailStr
from passlib.context import CryptContext
from jose import JWTError, jwt
from datetime import datetime, timedelta
from motor.motor_asyncio import AsyncIOMotorClient
import json
from bson import ObjectId
import os
from scraper.robots import Robots
from scraper.sitemap import Sitemap
from scraper.site import scrape_website, store_in_mongodb
from modules.project_manager import add_project_with_scraping
from utils.mongodb_utils import serialize_mongo_doc
from utils.project_utils import get_complete_project_data
import traceback
from utils.websocket_manager import ConnectionManager
import asyncio
from typing import Optional

app = FastAPI()

origins = ["http://localhost:5173"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SECRET_KEY = "yukgbdit7tk tuibk,gkvuy"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60*24*7

client = AsyncIOMotorClient("mongodb://localhost:27017")
db = client.hackathon
users_collection = db.users
projects_collection = db.projects

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

manager = ConnectionManager()

class User(BaseModel):
    name: str
    email: EmailStr
    password: str
    projects: list = []

class Token(BaseModel):
    access_token: str
    token_type: str

class ProjectURL(BaseModel):
    url: str
    scrape_mode: str = "limited"  # "all" or "limited"
    pages_limit: int = 5  # Default to 5 pages

class ExtractionInterrupt(BaseModel):
    client_id: str

class DynamicScrapeConfig(BaseModel):
    url: str
    cardSelector: str
    paginationSelector: Optional[str] = None
    pageHTML: str
    timestamp: str
    project_type: Optional[str] = "normal"  # Add project_type field with default "normal"

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: timedelta = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=15))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    error_msg = str(exc)
    print(f"Global exception handler caught: {error_msg}")
    print(traceback.format_exc())
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal server error: {error_msg}"},
    )

@app.post("/signup")
async def signup(user: User):
    try:
        existing = await users_collection.find_one({"email": user.email})
        if existing:
            raise HTTPException(status_code=400, detail="Email already registered")
        hashed_pw = get_password_hash(user.password)
        await users_collection.insert_one({"name": user.name, "email": user.email, "password": hashed_pw, "projects": []})
    except Exception as e:
        print(e)
    return {"message": "User created successfully"}

@app.post("/login", response_model=Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    try:
        user = await users_collection.find_one({"email": form_data.username})
        if not user or not verify_password(form_data.password, user['password']):
            raise HTTPException(status_code=400, detail="Incorrect email or password")
        access_token = create_access_token(data={"sub": user['email']})
        return {"access_token": access_token, "token_type": "bearer"}
    except Exception as e:
        print(e)
        raise HTTPException(status_code=500, detail="Internal server error")

async def get_current_user(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email = payload.get("sub")
        if email is None:
            raise HTTPException(status_code=401)
        user = await users_collection.find_one({"email": email})
        return user
    except JWTError:
        raise HTTPException(status_code=401)

@app.get("/me")
async def get_me(user: dict = Depends(get_current_user)):
    return {"name": user["name"]}

@app.post("/add_project")
async def add_project(user: dict = Depends(get_current_user), project_data: dict = None):
    try:
        if not project_data:
            raise HTTPException(status_code=400, detail="Project data is required")
        project_id = await projects_collection.insert_one({"user_email": user["email"], "site_data": project_data})
        await users_collection.update_one(
            {"email": user["email"]},
            {"$push": {"projects": str(project_id.inserted_id)}}
        )
        return {"message": "Project added successfully", "project_id": str(project_id.inserted_id)}
    except Exception as e:
        print(e)
        raise HTTPException(status_code=500, detail="Internal server error")

@app.get("/projects")
async def get_projects(user: dict = Depends(get_current_user)):
    try:
        cursor = projects_collection.find({"user_email": user["email"]})
        user_projects = await cursor.to_list(length=100)
        serialized_projects = [serialize_mongo_doc(project) for project in user_projects]
        return {"projects": serialized_projects}
    except Exception as e:
        print(f"Error fetching projects: {e}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error fetching projects: {str(e)}")

@app.get("/projects/{project_id}")
async def get_project(project_id: str, user: dict = Depends(get_current_user)):
    try:
        if not ObjectId.is_valid(project_id):
            raise HTTPException(status_code=400, detail="Invalid project ID format")
        project = await projects_collection.find_one({"_id": ObjectId(project_id)})
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        if project["user_email"] != user["email"]:
            raise HTTPException(status_code=403, detail="Not authorized to access this project")
        return serialize_mongo_doc(project)
    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"Error fetching project: {e}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error fetching project: {str(e)}")

@app.get("/projects/{project_id}/complete")
async def get_complete_project(project_id: str, user: dict = Depends(get_current_user)):
    try:
        # First, check if we have a valid ObjectId
        if not ObjectId.is_valid(project_id):
            raise HTTPException(status_code=400, detail="Invalid project ID format")
        
        # Get complete project data
        project_data = await get_complete_project_data(project_id, user["email"])
        
        if not project_data:
            raise HTTPException(status_code=404, detail="Project not found")
        
        return project_data
        
    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"Error fetching complete project: {e}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error fetching project: {str(e)}")

@app.delete("/projects/{project_id}")
async def delete_project(project_id: str, user: dict = Depends(get_current_user)):
    try:
        # Validate project ID format
        if not ObjectId.is_valid(project_id):
            raise HTTPException(status_code=400, detail="Invalid project ID format")
        
        # Convert to ObjectId for MongoDB
        project_obj_id = ObjectId(project_id)
        
        # Check if project exists and belongs to the user
        project = await projects_collection.find_one({"_id": project_obj_id})
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        if project["user_email"] != user["email"]:
            raise HTTPException(status_code=403, detail="Not authorized to delete this project")
        
        # Delete the project
        result = await projects_collection.delete_one({"_id": project_obj_id})
        
        if result.deleted_count == 0:
            raise HTTPException(status_code=500, detail="Failed to delete project")
        
        # Remove project reference from user's projects array
        await users_collection.update_one(
            {"email": user["email"]},
            {"$pull": {"projects": project_id}}
        )
        
        # Optional: Clean up related data (robots, scraped content)
        if project.get("site_data", {}).get("robots_id"):
            await db.robots.delete_one({"_id": ObjectId(project["site_data"]["robots_id"])})
        
        # Clean up scraped content
        for page_url in project.get("site_data", {}).get("scraped_pages", []):
            await db.sites.delete_one({"url": page_url})
        
        return {"message": "Project deleted successfully"}
    
    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"Error deleting project: {e}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error deleting project: {str(e)}")

@app.post("/interrupt_extraction")
async def interrupt_extraction(data: ExtractionInterrupt, user: dict = Depends(get_current_user)):
    """Interrupt an ongoing extraction process"""
    client_id = data.client_id
    
    if not client_id:
        raise HTTPException(status_code=400, detail="Client ID is required")
    
    from modules.project_manager import interrupt_extraction, get_extraction_status, active_extractions
    
    # Check if extraction exists
    if client_id not in active_extractions:
        raise HTTPException(status_code=404, detail="No active extraction found with this ID")
    
    # Check if user owns this extraction
    project_id = active_extractions[client_id].get("project_id")
    if project_id:
        project = await projects_collection.find_one({"_id": ObjectId(project_id)})
        if not project or project.get("user_email") != user["email"]:
            raise HTTPException(status_code=403, detail="Not authorized to interrupt this extraction")
    
    # Send interrupt signal
    result = interrupt_extraction(client_id)
    
    if result:
        # Send WebSocket message about interruption
        if client_id in active_extractions:
            await manager.send_personal_json({
                "type": "system",
                "timestamp": datetime.utcnow().isoformat(),
                "message": "Extraction interrupt requested. The process will stop at the next safe point."
            }, client_id)
        
        return {"message": "Interrupt signal sent. Extraction will stop at the next safe point."}
    else:
        raise HTTPException(status_code=400, detail="Failed to interrupt extraction")

@app.get("/extraction_status/{client_id}")
async def get_extraction_status_endpoint(client_id: str, user: dict = Depends(get_current_user)):
    """Get current status of an extraction process"""
    if not client_id:
        raise HTTPException(status_code=400, detail="Client ID is required")
    
    from modules.project_manager import get_extraction_status, active_extractions
    
    # Check if extraction exists
    if client_id not in active_extractions:
        raise HTTPException(status_code=404, detail="No active extraction found with this ID")
    
    # Check if user owns this extraction
    project_id = active_extractions[client_id].get("project_id")
    if project_id:
        project = await projects_collection.find_one({"_id": ObjectId(project_id)})
        if not project or project.get("user_email") != user["email"]:
            raise HTTPException(status_code=403, detail="Not authorized to access this extraction")
    
    status = get_extraction_status(client_id)
    if status:
        return status
    else:
        raise HTTPException(status_code=404, detail="Extraction status not found")

@app.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    await manager.connect(websocket, client_id)
    try:
        while True:
            # Keep the connection alive and wait for messages
            data = await websocket.receive_text()
            # Process client commands
            try:
                cmd = json.loads(data)
                if cmd.get("command") == "interrupt":
                    from modules.project_manager import interrupt_extraction
                    if interrupt_extraction(client_id):
                        await manager.send_personal_json({
                            "type": "system",
                            "timestamp": datetime.utcnow().isoformat(),
                            "message": "Extraction interrupt requested via WebSocket"
                        }, client_id)
            except:
                pass  # Ignore invalid commands
    except WebSocketDisconnect:
        manager.disconnect(client_id)
        print(f"Client #{client_id} disconnected")

@app.post("/add_project_with_scraping")
async def add_project_with_scraping_route(project: ProjectURL, user: dict = Depends(get_current_user)):
    # Pass the manager to the function so it can send WebSocket updates
    return await add_project_with_scraping(
        user_email=user["email"], 
        url=project.url, 
        ws_manager=manager,
        scrape_mode=project.scrape_mode,
        pages_limit=project.pages_limit
    )

@app.post("/dynamic_scrape")
async def dynamic_scrape(config: DynamicScrapeConfig, user: dict = Depends(get_current_user)):
    """Start a dynamic scraping job based on visual selection"""
    try:
        # Generate a unique ID for this scraping job
        scrape_id = str(ObjectId())
        
        # Store the configuration
        scrape_config = {
            "user_email": user["email"],
            "user_id": str(user["id"]) if "id" in user else None,
            "scrape_id": scrape_id,
            "url": config.url,
            "card_selector": config.cardSelector,
            "pagination_selector": config.paginationSelector,
            "sample_html": config.pageHTML[:50000],  # Store a sample of the HTML (limit size)
            "status": "queued",
            "created_at": datetime.utcnow().isoformat(),
            "pages_scraped": 0,
            "items_found": 0,
            "project_type": config.project_type,  # Store project type
            "errors": []
        }
        
        # Save to MongoDB
        await db.dynamic_scrapes.insert_one(scrape_config)
        
        # Start the scraping process in background
        asyncio.create_task(run_dynamic_scraper(scrape_id, config.dict(), user["email"]))
        
        return {"message": "Dynamic scraping job started", "scrape_id": scrape_id}
    
    except Exception as e:
        print(f"Error starting dynamic scrape: {e}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to start dynamic scraping: {str(e)}")

@app.get("/dynamic_scrapes")
async def get_dynamic_scrapes(user: dict = Depends(get_current_user)):
    """Get all dynamic scraping jobs for the current user"""
    try:
        cursor = db.dynamic_scrapes.find({"user_email": user["email"]})
        scrapes = await cursor.to_list(length=100)
        return {"scrapes": [serialize_mongo_doc(scrape) for scrape in scrapes]}
    
    except Exception as e:
        print(f"Error fetching dynamic scrapes: {e}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to fetch dynamic scrapes: {str(e)}")

@app.get("/dynamic_scrapes/{scrape_id}")
async def get_dynamic_scrape(scrape_id: str, user: dict = Depends(get_current_user)):
    """Get a specific dynamic scraping job and its results"""
    try:
        # Get the scrape configuration
        scrape = await db.dynamic_scrapes.find_one({"scrape_id": scrape_id, "user_email": user["email"]})
        if not scrape:
            raise HTTPException(status_code=404, detail="Scraping job not found")
        
        # Get the scrape results
        cursor = db.dynamic_scrape_results.find({"scrape_id": scrape_id})
        results = await cursor.to_list(length=1000)
        
        return {
            "scrape": serialize_mongo_doc(scrape),
            "results": [serialize_mongo_doc(result) for result in results]
        }
    
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error fetching dynamic scrape: {e}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to fetch dynamic scrape: {str(e)}")

@app.post("/store_extracted_data")
async def store_extracted_data(data: dict, user: dict = Depends(get_current_user)):
    try:
        project_id = data.get("project_id")
        extracted_data = data.get("data")
        if not project_id or not extracted_data:
            raise HTTPException(status_code=400, detail="Project ID and data are required")
        
        project = await projects_collection.find_one({"_id": ObjectId(project_id)})
        if not project or project["user_email"] != user["email"]:
            raise HTTPException(status_code=403, detail="Not authorized to update this project")
        
        await projects_collection.update_one(
            {"_id": ObjectId(project_id)},
            {"$push": {"extracted_data": {"$each": extracted_data}}}
        )
        return {"message": "Data stored successfully"}
    except Exception as e:
        print(f"Error storing extracted data: {e}")
        raise HTTPException(status_code=500, detail="Failed to store data")

log_file = "page_sources.json"

class PageSource(BaseModel):
    url: str
    source: str

@app.post("/log")
async def log_page_source(data: PageSource):
    log_entry = {
        "timestamp": datetime.now().isoformat(),
        "url": data.url,
        "source": data.source
    }
    with open(log_file, "a") as f:
        f.write(json.dumps(log_entry) + "\n")
    return {"message": "Page source logged successfully"}

@app.get("/logs")
async def get_logs():
    # Ensure the log file exists
    if not os.path.exists(log_file):
        with open(log_file, "w") as f:
            f.write("")  # Create an empty file if it doesn't exist
    with open(log_file, "r") as f:
        logs = f.readlines()
    return {"logs": [json.loads(log) for log in logs if log.strip()]}

@app.get("/live-logs", response_class=HTMLResponse)
async def live_logs():
    return """
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" width="device-width, initial-scale=1.0">
        <title>Live Logs</title>
    </head>
    <body>
        <h1>Live Logs</h1>
        <ul id="logs"></ul>
        <script>
            async function fetchLogs() {
                const response = await fetch('/logs');
                const data = await response.json();
                const logsList = document.getElementById('logs');
                logsList.innerHTML = ''; // Clear existing logs
                data.logs.forEach(log => {
                    const li = document.createElement('li');
                    li.textContent = `Timestamp: ${log.timestamp}, URL: ${log.url}`;
                    logsList.appendChild(li);
                });
            }
            setInterval(fetchLogs, 2000); // Fetch logs every 2 seconds
        </script>
    </body>
    </html>
    """