import requests
from bs4 import BeautifulSoup
from PIL import Image
import pytesseract
from io import BytesIO
from pymongo import MongoClient
import time

def scrape_website(url):
    # Record start time for network metrics
    start_time = time.time()
    network_metrics = {
        "url": url,
        "start_time": start_time,
        "end_time": None,
        "duration_ms": None,
        "status_code": None,
        "content_size_bytes": 0,
        "speed_kbps": None,
        "headers": {}
    }
    
    # Fetch the webpage content
    try:
        response = requests.get(url)
        # Record network metrics
        network_metrics["end_time"] = time.time()
        network_metrics["duration_ms"] = int((network_metrics["end_time"] - network_metrics["start_time"]) * 1000)
        network_metrics["status_code"] = response.status_code
        network_metrics["content_size_bytes"] = len(response.content)
        
        # Calculate download speed in KB/s
        if network_metrics["duration_ms"] > 0:
            network_metrics["speed_kbps"] = (network_metrics["content_size_bytes"] / 1024) / (network_metrics["duration_ms"] / 1000)
        
        # Store important headers
        for header in ["content-type", "server", "cache-control"]:
            if header in response.headers:
                network_metrics["headers"][header] = response.headers[header]
    except Exception as e:
        return {
            "error": f"Failed to fetch the webpage: {str(e)}",
            "network_metrics": network_metrics
        }
    
    if response.status_code != 200:
        return {
            "error": f"Failed to fetch the webpage. Status code: {response.status_code}",
            "network_metrics": network_metrics
        }
    
    soup = BeautifulSoup(response.content, 'html.parser')
    
    # Extract textual content with metadata
    text_content = []
    for p in soup.find_all('p'):
        text_content.append({
            "type": "paragraph",
            "content": p.get_text(strip=True)
        })
    
    # Extract image URLs with metadata
    images = []
    for img_tag in soup.find_all('img'):
        img_url = img_tag.get('src')
        if img_url:
            if not img_url.startswith(('http://', 'https://')):
                img_url = requests.compat.urljoin(url, img_url)
            images.append({
                "type": "image",
                "url": img_url,
                "alt_text": img_tag.get('alt', '').strip()
            })
    
    # Extract text from images with metadata
    image_texts = []
    for img in images:
        try:
            img_response = requests.get(img["url"])
            if img_response.status_code == 200:
                img_obj = Image.open(BytesIO(img_response.content))
                text_from_image = pytesseract.image_to_string(img_obj).strip()
                image_texts.append({
                    "type": "image_text",
                    "image_url": img["url"],
                    "extracted_text": text_from_image
                })
        except Exception as e:
            image_texts.append({
                "type": "image_text",
                "image_url": img["url"],
                "error": f"Error processing image: {e}"
            })
    
    # Extract orders with metadata (example assumes orders are in a table)
    orders = []
    order_table = soup.find('table', {'id': 'orders'})  # Replace 'id' with the actual identifier for the orders table
    if order_table:
        for row in order_table.find_all('tr')[1:]:  # Skip the header row
            cells = row.find_all('td')
            if len(cells) > 1:
                orders.append({
                    "order_id": cells[0].get_text(strip=True),
                    "product_name": cells[1].get_text(strip=True),
                    "quantity": cells[2].get_text(strip=True) if len(cells) > 2 else None,
                    "price": cells[3].get_text(strip=True) if len(cells) > 3 else None
                })
    
    # Structure the extracted data
    structured_data = {
        "url": url,
        "content": {
            "text_content": text_content,
            "images": images,
            "image_texts": image_texts,
            "orders": orders  # Include orders in the structured data
        },
        "network_metrics": network_metrics  # Include network metrics in the result
    }
    
    return structured_data

def store_in_mongodb(data):
    try:
        # Connect to MongoDB
        client = MongoClient("mongodb://localhost:27017/")
        db = client["hackathon"]
        collection = db["sites"]
        
        # Insert the data into the collection
        collection.insert_one(data)
        print("Data successfully stored in MongoDB.")
    except Exception as e:
        print(f"Error storing data in MongoDB: {e}")

# # Example usage
# if __name__ == "__main__":
#     url = "https://internshala.com/internship/detail/sales-and-marketing-associate-internship-in-multiple-locations-at-aimaxon-marketing-solutions-private-limited1739926646"  # Replace with the target URL
#     result = scrape_website(url)
#     print(result)
    
#     # Store the result in MongoDB
#     if "error" not in result:
#         store_in_mongodb(result)
