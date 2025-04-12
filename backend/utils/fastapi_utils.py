from fastapi.responses import JSONResponse
from bson import ObjectId
import json
from datetime import datetime

class MongoJSONEncoder(json.JSONEncoder):
    """Custom JSON encoder that handles ObjectId and datetime objects"""
    def default(self, obj):
        if isinstance(obj, ObjectId):
            return str(obj)
        if isinstance(obj, datetime):
            return obj.isoformat()
        return super().default(obj)

class MongoJSONResponse(JSONResponse):
    """Custom JSONResponse that properly serializes MongoDB objects like ObjectId"""
    def render(self, content) -> bytes:
        return json.dumps(
            content,
            ensure_ascii=False,
            allow_nan=False,
            indent=None,
            separators=(",", ":"),
            cls=MongoJSONEncoder,
        ).encode("utf-8")
