from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime
from bson import ObjectId

class ExtensionCardData(BaseModel):
    """Model for card data extracted from websites using the extension"""
    title: Optional[str] = None
    text: str
    html: str
    links: List[str] = []
    images: List[str] = []
    structured_data: Dict[str, Any] = {}
    
class ExtensionProject(BaseModel):
    """Model for projects created using the browser extension"""
    project_id: str = Field(default_factory=lambda: str(ObjectId()))
    user_id: str
    user_email: str
    url: str
    name: Optional[str] = None
    description: Optional[str] = None
    card_selector: str
    pagination_selector: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    status: str = "completed"
    cards_extracted: int = 0
    pages_scraped: int = 0
    extracted_data: List[ExtensionCardData] = []
    
    class Config:
        schema_extra = {
            "example": {
                "project_id": "507f1f77bcf86cd799439011",
                "user_id": "507f1f77bcf86cd799439022",
                "user_email": "user@example.com",
                "url": "https://example.com/products",
                "name": "Example Products",
                "description": "Product data from example.com",
                "card_selector": ".product-card",
                "pagination_selector": ".pagination",
                "created_at": "2023-04-01T12:00:00",
                "status": "completed",
                "cards_extracted": 24,
                "pages_scraped": 2,
                "extracted_data": [
                    {
                        "title": "Product 1",
                        "text": "This is product 1 description",
                        "html": "<div class='product-card'>...</div>",
                        "links": ["https://example.com/product1"],
                        "images": ["https://example.com/images/product1.jpg"],
                        "structured_data": {"price": "$19.99"}
                    }
                ]
            }
        }
