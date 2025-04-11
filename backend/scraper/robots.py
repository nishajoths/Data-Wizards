import requests
from pymongo import MongoClient
from datetime import datetime, UTC

class Robots:
    def __init__(self, site, db="hackathon", col="robots"):
        site = site.strip()
        client = MongoClient("mongodb://localhost:27017")
        self.db = client[db]
        self.collection = self.db[col]
        self.sitemap_urls = []
        content, request_info = self.fetch_robots_txt(site)

        if content:
            rules, sitemaps = self.parse_robots_txt(content)
            self.sitemap_urls = sitemaps
            _id = self.save_to_mongodb(site, rules, sitemaps, request_info)
            self._id = _id
        else:
            print("No robots.txt found or unable to fetch.")
            self._id = None
        
    def fetch_robots_txt(self, url):
        try:
            if not url.startswith("http"):
                url = "http://" + url
            if not url.endswith("/"):
                url += "/"

            robots_url = url + "robots.txt"
            response = requests.get(robots_url, timeout=10)

            # collect metadata
            request_info = {
                "status_code": response.status_code,
                "headers": dict(response.headers),
                "encoding": response.encoding,
                "cookies": response.cookies.get_dict(),
                "final_url": response.url
            }

            return response.text, request_info
        except Exception as e:
            print(f"[Error] {e}")
            return None, {}

    def parse_robots_txt(self, text):
        rules = []
        sitemaps = []
        
        for line in text.splitlines():
            line = line.strip()
            if line.startswith("Allow:") or line.startswith("Disallow:"):
                try:
                    permission, path = line.split(":", 1)
                    permission = permission.strip()
                    path = path.strip()
                    if path:
                        rules.append({
                            "path": path,
                            "permission": True if permission == "Allow" else False
                        })
                except:
                    continue
            # Extract sitemap URLs
            elif line.lower().startswith("sitemap:"):
                try:
                    _, url = line.split(":", 1)
                    url = url.strip()
                    if url:
                        sitemaps.append(url)
                except:
                    continue
                    
        return rules, sitemaps

    def save_to_mongodb(self, domain, rules, sitemaps, request_info):
        try:
            result = self.collection.insert_one({
                "domain": domain,
                "rules": rules,
                "sitemaps": sitemaps,
                "cookies": request_info.get("cookies"),
                "request_info": {
                    "status_code": request_info.get("status_code"),
                    "headers": request_info.get("headers"),
                    "encoding": request_info.get("encoding"),
                    "final_url": request_info.get("final_url")
                },
                "created_at": datetime.now(UTC)
            })

            print(f"Saved to MongoDB for {domain}")
            return result.inserted_id
        except Exception as e:
            print(f"MongoDB Error: {e}")
            return None
            
    def get_sitemap_urls(self):
        """Return the list of sitemap URLs found in robots.txt"""
        return self.sitemap_urls


