from fastapi import APIRouter, HTTPException, Depends, Body
from bs4 import BeautifulSoup
import re
from typing import Dict, Any, List, Optional
from pydantic import BaseModel
from ..auth.auth import get_current_user
import hashlib
from datetime import datetime

router = APIRouter()

class PageData(BaseModel):
    url: str
    pageTitle: str
    html: str
    timestamp: str

class PatternDetectionResult(BaseModel):
    cardSelector: Optional[str] = None
    cardCount: int = 0
    paginationSelector: Optional[str] = None
    projectId: Optional[str] = None

@router.post("/analyze-page", response_model=PatternDetectionResult)
async def analyze_page(
    page_data: PageData = Body(...),
    current_user = Depends(get_current_user)
):
    """
    Analyze page content to detect repeating patterns and pagination
    """
    try:
        # Parse HTML
        soup = BeautifulSoup(page_data.html, 'html.parser')
        
        # Find card patterns
        card_selector, card_count = detect_repeating_patterns(soup)
        
        # Find pagination patterns
        pagination_selector = detect_pagination_patterns(soup, page_data.url)
        
        # Create project and store HTML for future reference
        project_id = store_project_data(page_data, current_user, card_selector, pagination_selector)
        
        return PatternDetectionResult(
            cardSelector=card_selector,
            cardCount=card_count,
            paginationSelector=pagination_selector,
            projectId=project_id
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error analyzing page: {str(e)}")

def detect_repeating_patterns(soup):
    """
    Detect repeating card-like elements on the page
    """
    # Candidate elements to check for repeated patterns
    candidate_tags = ['div', 'article', 'li', 'section', 'tr', 'figure']
    
    best_pattern = None
    max_count = 0
    best_selector = None
    
    # Common class patterns that often indicate cards
    card_class_patterns = [
        'card', 'item', 'product', 'post', 'article', 'grid-item', 'list-item',
        'result', 'entry', 'cell', 'tile', 'box'
    ]
    
    # First check for elements with these common class names
    for pattern in card_class_patterns:
        for tag in candidate_tags:
            # Try common class patterns
            selector = f"{tag}[class*='{pattern}']"
            elements = soup.select(selector)
            
            if len(elements) > 3:  # Need at least 3 similar elements
                # Check if these elements have similar structure
                if have_similar_structure(elements):
                    if len(elements) > max_count:
                        max_count = len(elements)
                        best_pattern = elements
                        best_selector = selector
    
    # If we found a good pattern, return it
    if best_selector:
        return best_selector, max_count
    
    # If not found with class patterns, try other approaches
    # Look for lists of elements
    for tag in ['ul', 'ol', 'div']:
        parent_elements = soup.find_all(tag)
        for parent in parent_elements:
            children = parent.find_all(recursive=False)
            if len(children) >= 3:  # At least 3 children to be considered a list
                # Check if children have similar structure
                if len(set([child.name for child in children])) == 1:  # All children have same tag
                    if have_similar_structure(children):
                        # Create a selector for these children
                        if parent.get('id'):
                            selector = f"#{parent['id']} > {children[0].name}"
                        elif parent.get('class'):
                            selector = f"{parent.name}.{' '.join(parent['class'])} > {children[0].name}"
                        else:
                            continue
                            
                        elements = soup.select(selector)
                        if len(elements) > max_count:
                            max_count = len(elements)
                            best_pattern = elements
                            best_selector = selector
    
    # If still not found, try grid layouts
    if not best_selector:
        grid_patterns = ['grid', 'flex', 'row', 'container']
        for pattern in grid_patterns:
            selector = f"div[class*='{pattern}'] > div"
            elements = soup.select(selector)
            if len(elements) >= 3:
                if have_similar_structure(elements):
                    if len(elements) > max_count:
                        max_count = len(elements)
                        best_pattern = elements
                        best_selector = selector
    
    return best_selector, max_count

def have_similar_structure(elements, similarity_threshold=0.7):
    """
    Check if a list of elements have similar structure
    """
    if len(elements) < 2:
        return False
        
    # Get basic structure fingerprints for all elements
    fingerprints = [get_element_fingerprint(el) for el in elements]
    
    # Compare all elements against the first one
    reference = fingerprints[0]
    similar_count = 0
    
    for fp in fingerprints[1:]:
        similarity = calculate_similarity(reference, fp)
        if similarity >= similarity_threshold:
            similar_count += 1
    
    # If most elements have similar structure to the first one
    return similar_count >= len(elements) * 0.7 - 1

def get_element_fingerprint(element):
    """
    Create a simple fingerprint of element structure
    """
    # Count descendant elements by type
    tag_counts = {}
    for tag in element.find_all():
        tag_name = tag.name
        if tag_name in tag_counts:
            tag_counts[tag_name] += 1
        else:
            tag_counts[tag_name] = 1
    
    # Check for common card elements
    has_image = bool(element.find('img'))
    has_link = bool(element.find('a'))
    has_heading = bool(element.find(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']))
    has_paragraph = bool(element.find('p'))
    
    return {
        'tag_counts': tag_counts,
        'has_image': has_image,
        'has_link': has_link,
        'has_heading': has_heading,
        'has_paragraph': has_paragraph,
        'text_length': len(element.get_text(strip=True))
    }

def calculate_similarity(fp1, fp2):
    """
    Calculate similarity between two element fingerprints
    """
    # Compare basic features
    feature_score = 0
    if fp1['has_image'] == fp2['has_image']:
        feature_score += 0.25
    if fp1['has_link'] == fp2['has_link']:
        feature_score += 0.25
    if fp1['has_heading'] == fp2['has_heading']:
        feature_score += 0.25
    if fp1['has_paragraph'] == fp2['has_paragraph']:
        feature_score += 0.25
    
    # Compare tag counts
    tag_score = 0
    all_tags = set(fp1['tag_counts'].keys()) | set(fp2['tag_counts'].keys())
    if all_tags:
        matching_tags = 0
        for tag in all_tags:
            count1 = fp1['tag_counts'].get(tag, 0)
            count2 = fp2['tag_counts'].get(tag, 0)
            if count1 == count2:
                matching_tags += 1
            elif min(count1, count2) > 0:  # Partial match
                matching_tags += 0.5
        tag_score = matching_tags / len(all_tags)
    
    # Text length comparison (normalized)
    max_len = max(fp1['text_length'], fp2['text_length'])
    min_len = min(fp1['text_length'], fp2['text_length'])
    text_score = min_len / max_len if max_len > 0 else 1.0
    
    # Weighted average
    return (feature_score * 0.4) + (tag_score * 0.4) + (text_score * 0.2)

def detect_pagination_patterns(soup, url):
    """
    Detect pagination elements on the page
    """
    # Common class patterns for pagination
    pagination_patterns = [
        'pagination', 'pager', 'pages', 'page-numbers', 'paginate', 'pageNav',
        'page-navigation', 'pagenav', 'page-nav', 'paging'
    ]
    
    # Check for elements with these class patterns
    for pattern in pagination_patterns:
        # Try to find a container
        selector = f"[class*='{pattern}']"
        pagination_containers = soup.select(selector)
        
        for container in pagination_containers:
            # Look for active/current page indicator
            active_elements = container.select('[class*="active"], [class*="current"], [aria-current="page"]')
            if active_elements:
                return selector
            
            # Look for next/prev links
            next_links = container.select('a[rel="next"], [aria-label*="next"], [class*="next"]')
            if next_links:
                return selector
    
    # Look for common pagination URL patterns
    page_param_patterns = [r'[?&]page=\d+', r'[?&]p=\d+', r'[?&]pg=\d+', r'/page/\d+']
    link_elements = soup.find_all('a', href=True)
    
    for link in link_elements:
        href = link.get('href', '')
        for pattern in page_param_patterns:
            if re.search(pattern, href):
                # Try to get the parent container
                parent = link.parent
                if parent:
                    # Check if parent has multiple links (pagination typically has multiple page links)
                    if len(parent.find_all('a')) > 1:
                        if parent.get('id'):
                            return f"#{parent['id']}"
                        elif parent.get('class'):
                            return f"{parent.name}.{' '.join(parent['class'])}"
    
    return None

def store_project_data(page_data, user, card_selector, pagination_selector):
    """
    Store the page data and detected patterns as a project
    """
    # Create a unique project ID based on URL and timestamp
    project_hash = hashlib.md5(f"{page_data.url}_{datetime.now().isoformat()}".encode()).hexdigest()
    
    # In a real implementation, you would store this in your database
    # For now, we'll just return the project ID
    return project_hash
