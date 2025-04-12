from fastapi import Depends, HTTPException
from jose import JWTError, jwt
from fastapi.security import OAuth2PasswordBearer
from motor.motor_asyncio import AsyncIOMotorClient

# Constants for JWT
SECRET_KEY = "yukgbdit7tk tuibk,gkvuy"
ALGORITHM = "HS256"

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# Connect to MongoDB - this should match your main.py connection
client = AsyncIOMotorClient("mongodb://localhost:27017")
db = client.hackathon
users_collection = db.users

async def get_current_user(token: str = Depends(oauth2_scheme)):
    """
    Validate the token and return the current user
    """
    credentials_exception = HTTPException(
        status_code=401,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    user = await users_collection.find_one({"email": email})
    if user is None:
        raise credentials_exception
    
    return user
