from groq import Groq
from typing import List, Dict, Any, Optional, Union
import logging
import json

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class ScrapingAssistant:
    # Define constants
    DEFAULT_MODEL = "llama-3.3-70b-versatile"
    COMPARISON_TEMPLATE = """
    # Item Comparison Analysis
    
    I'll analyze the following items and provide a structured comparison:
    
    {items_text}
    
    ## Analysis Guidelines
    Please provide a comprehensive analysis with the following clearly labeled sections:
    
    ### 1. Similarities
    - List all common features, attributes, or characteristics shared across items
    - Format each point as a separate bullet point
    - Be specific and detailed
    
    ### 2. Differences
    - List key differences between items in these categories:
      - Features: Different capabilities or functions
      - Performance: Speed, efficiency, or output quality differences
      - Design: Physical or visual differences
      - Price/Value: Cost or value proposition differences
      - Target Market: Different intended users or use cases
    - Format as structured bullet points under each category
    
    ### 3. Comparison Table
    - Create a feature-by-feature comparison table
    - Include all relevant attributes
    - Use consistent formatting with | as column separators
    
    The response must maintain this exact structure for proper parsing.
    """
    
    def __init__(self, api_key='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'):
        # Initialize Groq client
        self.client = Groq(api_key=api_key)
        logger.info("ScrapingAssistant initialized")

    def _process_streaming_completion(self, completion) -> str:
        """
        Process streaming completion from Groq API.
        
        Args:
            completion: Streaming completion object from Groq
            
        Returns:
            str: Concatenated result from all chunks
        """
        result = ""
        try:
            for chunk in completion:
                if chunk.choices and chunk.choices[0].delta:
                    result += chunk.choices[0].delta.content or ""
            return result
        except Exception as e:
            logger.error(f"Error processing streaming completion: {e}")
            return result

    def can_scrape(self, url: str, robots_txt: Optional[str] = None, terms_url: Optional[str] = None) -> str:
        """
        Determine if a website can be scraped based on its robots.txt and terms of service.
        
        Args:
            url: Target website URL
            robots_txt: Contents of robots.txt file if available
            terms_url: URL to the terms and conditions page if available
            
        Returns:
            str: "Yes" or "No" indicating if scraping is allowed
        """
        logger.info(f"Evaluating scraping permissions for: {url}")
        
        # Format the prompt with available information
        content = f"Can I scrape data from {url}?\n\n"
        
        if robots_txt:
            content += f"Robots.txt content:\n{robots_txt}\n\n"
        else:
            content += "Robots.txt not found or inaccessible.\n\n"
            
        if terms_url:
            content += f"Terms and Conditions found at: {terms_url}\n\n"
        else:
            content += "No specific Terms and Conditions page found.\n\n"
            
        content += "Just answer Yes or No. If no information is provided about scraping in robots.txt or terms and conditions directly assume Yes. if no information from robots and terms directly assume Yes."
        
        # Prepare messages for the LLM
        messages = [
            {
                "role": "system",
                "content": "You are an assistant that answers only with 'Yes' or 'No' about whether a website can be scraped based on robots.txt and terms of service."
            },
            {
                "role": "user",
                "content": content
            }
        ]
        
        try:
            # Send the message to the model
            completion = self.client.chat.completions.create(
                model=self.DEFAULT_MODEL,
                messages=messages,
                temperature=0,  # lower temperature for deterministic output
                max_completion_tokens=10,
                top_p=1,
                stream=True,
                stop=None,
            )
    
            # Process the result
            result = self._process_streaming_completion(completion)
            
            # Normalize the response to just "Yes" or "No"
            result = result.strip().lower()
            if "yes" in result:
                return "Yes"
            elif "no" in result:
                return "No"
            return "Yes"  # Default to Yes if unclear
        
        except Exception as e:
            logger.error(f"Error during can_scrape request: {e}")
            return "Yes"  # Default to Yes on error
        
    def compare_items(self, items: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Compare multiple items and find similarities and differences.
        
        Args:
            items: List of dictionaries containing item details
        
        Returns:
            dict: Structured comparison results with similarities, differences, and comparison table
        """
        logger.info(f"Comparing {len(items)} items")
        
        # Format the items text
        items_text = ""
        for i, item in enumerate(items, 1):
            items_text += f"## Item {i}:\n"
            for key, value in item.items():
                items_text += f"- {key}: {value}\n"
            items_text += "\n"
        
        # Create the complete prompt using the template
        content = self.COMPARISON_TEMPLATE.format(items_text=items_text)
        
        # Prepare messages for the LLM
        messages = [
            {
                "role": "system",
                "content": "You are a specialized comparison assistant that provides detailed, structured analyses of products, services, or content. Always maintain the requested structure in your responses."
            },
            {
                "role": "user",
                "content": content
            }
        ]
        
        try:
            # Send the message to the model
            completion = self.client.chat.completions.create(
                model=self.DEFAULT_MODEL,
                messages=messages,
                temperature=0.1,  # Slightly creative but mostly factual
                max_tokens=3000,
                top_p=1,
                stream=True,
                stop=None,
            )
    
            # Process the result
            result = self._process_streaming_completion(completion)
            
            # Parse the structured results
            return self._parse_comparison_result(result)
            
        except Exception as e:
            logger.error(f"Error during comparison request: {e}")
            return {
                "raw_response": str(e),
                "similarities": [],
                "differences": {},
                "comparison_table": []
            }
    
    def _parse_comparison_result(self, result: str) -> Dict[str, Any]:
        """
        Parse comparison results into a structured format.
        
        Args:
            result: Raw text response from the LLM
            
        Returns:
            dict: Structured comparison results
        """
        try:
            # Split result into lines for processing
            lines = result.split('\n')
            
            similarities = []
            differences = {}
            comparison_table = []
            
            current_section = None
            current_category = None
            
            # Process each line to extract structured data
            for line in lines:
                line = line.strip()
                if not line:
                    continue
                
                # Detect section headers
                lower_line = line.lower()
                if "similarities" in lower_line or "common features" in lower_line:
                    current_section = "similarities"
                    current_category = None
                    continue
                elif "differences" in lower_line:
                    current_section = "differences"
                    current_category = None
                    continue
                elif "comparison table" in lower_line:
                    current_section = "table"
                    current_category = None
                    continue
                
                # Process content based on current section
                if current_section == "similarities":
                    if line.startswith(("-", "•", "*", "1.", "2.", "-", "+")):
                        similarities.append(line.lstrip("-•*123456789. +-"))
                
                elif current_section == "differences":
                    # Check for category headers within differences
                    if any(category in lower_line for category in ["features:", "performance:", "design:", "price/value:", "target market:"]):
                        category_name = line.split(':')[0].strip()
                        current_category = category_name
                        differences[current_category] = []
                    elif current_category and line.startswith(("-", "•", "*", "1.", "2.", "-", "+")):
                        if current_category not in differences:
                            differences[current_category] = []
                        differences[current_category].append(line.lstrip("-•*123456789. +-"))
                    elif line.startswith(("-", "•", "*", "1.", "2.", "-", "+")) and not current_category:
                        # Handle uncategorized differences
                        if "General" not in differences:
                            differences["General"] = []
                        differences["General"].append(line.lstrip("-•*123456789. +-"))
                
                elif current_section == "table" and ("|" in line or line.startswith(("-", "•", "*"))):
                    comparison_table.append(line)
            
            # If differences doesn't have categories but has items, create a general category
            if not differences and current_section == "differences":
                differences = {"General": similarities}
            
            # Return the structured results
            return {
                "raw_response": result,
                "similarities": similarities,
                "differences": differences,
                "comparison_table": comparison_table
            }
        
        except Exception as e:
            logger.error(f"Error parsing comparison result: {e}")
            # If parsing fails, return the raw result
            return {
                "raw_response": result,
                "similarities": [],
                "differences": {},
                "comparison_table": []
            }