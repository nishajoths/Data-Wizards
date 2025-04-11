from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.responses import JSONResponse
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

@app.post("/add_project_with_scraping")
async def add_project_with_scraping_route(project: ProjectURL, user: dict = Depends(get_current_user)):
    return await add_project_with_scraping(user_email=user["email"], url=project.url)