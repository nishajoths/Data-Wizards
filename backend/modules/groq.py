from groq import Groq

class ScrapingAssistant:
    def __init__(self, api_key='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'):
        # Initialize Groq client
        self.client = Groq(api_key=api_key)

    def can_scrape(self, url, robots_txt=None, terms_url=None):
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
        
        # Send the message to the model
        completion = self.client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=messages,
            temperature=0,  # lower temperature for deterministic output
            max_completion_tokens=10,
            top_p=1,
            stream=True,
            stop=None,
        )

        # Collect and return the result
        result = ""
        for chunk in completion:
            result += chunk.choices[0].delta.content or ""
        
        # Normalize the response to just "Yes" or "No"
        result = result.strip().lower()
        if "yes" in result:
            return "Yes"
        elif "no" in result:
            return "No"
        return "Yes"  # Default to Yes if unclear