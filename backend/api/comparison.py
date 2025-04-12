from fastapi import APIRouter, HTTPException, Depends, Body
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from modules.groq import ScrapingAssistant  # Changed from relative to absolute import
from auth.auth import get_current_user  # Changed from relative to absolute import

router = APIRouter()

class ComparisonItem(BaseModel):
    title: str
    description: str
    attributes: Dict[str, Any]

class ComparisonRequest(BaseModel):
    items: List[ComparisonItem]

@router.post("/compare-items")
async def compare_items(
    request: ComparisonRequest,
    current_user = Depends(get_current_user)
):
    """
    Compare multiple items using the Groq LLM
    """
    try:
        if len(request.items) < 2:
            raise HTTPException(status_code=400, detail="At least 2 items are required for comparison")
        
        # Initialize the ScrapingAssistant
        assistant = ScrapingAssistant()
        
        # Format items for comparison
        formatted_items = []
        for item in request.items:
            formatted_item = {
                "title": item.title,
                "description": item.description
            }
            # Add all attributes
            for key, value in item.attributes.items():
                formatted_item[key] = value
            
            formatted_items.append(formatted_item)
        
        # Perform the comparison
        comparison_result = assistant.compare_items(formatted_items)
        
        return {
            "status": "success",
            "comparison_result": comparison_result
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Comparison failed: {str(e)}")
