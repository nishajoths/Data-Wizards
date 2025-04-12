from bson import ObjectId
import json
from datetime import datetime

class MongoJSONEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, ObjectId):
            return str(obj)
        if isinstance(obj, datetime):
            return obj.isoformat()
        return super().default(obj)

def serialize_mongo_doc(doc):
    """Convert MongoDB document to JSON-serializable dict"""
    if doc is None:
        return None
    
    if isinstance(doc, ObjectId):
        return str(doc)
    
    if isinstance(doc, datetime):
        return doc.isoformat()
    
    if not isinstance(doc, dict):
        return doc
    
    result = {}
    for key, value in doc.items():
        if isinstance(value, ObjectId):
            result[key] = str(value)
        elif isinstance(value, datetime):
            result[key] = value.isoformat()
        elif isinstance(value, list):
            result[key] = [
                serialize_mongo_doc(item) if isinstance(item, dict) or isinstance(item, ObjectId)
                else str(item) if isinstance(item, ObjectId)
                else item.isoformat() if isinstance(item, datetime)
                else item
                for item in value
            ]
        elif isinstance(value, dict):
            result[key] = serialize_mongo_doc(value)
        else:
            result[key] = value
    
    return result
