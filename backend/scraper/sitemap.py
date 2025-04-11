import requests
from bs4 import BeautifulSoup
from urllib.parse import urlparse
from pymongo import MongoClient
from datetime import datetime, timezone, UTC
import os
import traceback

class Sitemap:
    def __init__(self, start_url,
                 mongo_uri="mongodb://localhost:27017",
                 db_name="hackathon"):
        self.start_url = start_url
        self.page_urls = set([start_url])  # Initialize with at least the start URL
        self.parsed_sitemaps = set()
        
        try:
            if not self.start_url.startswith("http"):
                self.start_url = "https://" + self.start_url
                
            # Make the sitemap URL if not already a sitemap
            if not str.lower(self.start_url).endswith("sitemap.xml"):
                sitemap_url = self.start_url
                if not sitemap_url.endswith('/'):
                    sitemap_url += '/'
                sitemap_url += "sitemap.xml"
            else:
                sitemap_url = self.start_url
                
            # Try to get the sitemap
            try:
                req = requests.get(sitemap_url, timeout=10)
                if req.status_code == 200:
                    self.start_url = sitemap_url
                else:
                    print(f"No sitemap found at {sitemap_url}, status code: {req.status_code}")
            except Exception as e:
                print(f"Error accessing sitemap: {e}")
                print(traceback.format_exc())
                # Continue with just the start URL
            
            # MongoDB setup
            client = MongoClient(mongo_uri)
            db = client[db_name]
            self.sitemaps_col = db["sitemaps"]
            self.pages_col = db["pages"]
            
            # Process the sitemap if it was accessible
            if req.status_code == 200:
                self.run()
        except Exception as e:
            print(f"Error in Sitemap initialization: {e}")
            print(traceback.format_exc())
            # Make sure page_urls exists even if there's an error
            self.page_urls = set([start_url])

    def _fetch(self, url):
        """Fetch a URL and return (response, content_type)."""
        resp = requests.get(url, timeout=10)
        return resp, resp.headers.get("Content-Type", "")

    def _detect_url_tag(self, soup):
        """
        Inspect the first <url> or <sitemap> element to find
        which child tag’s text starts with 'http'.
        """
        container = soup.find(['url', 'sitemap'])
        if not container:
            return None
        for child in container.find_all(recursive=False):
            txt = child.get_text(strip=True)
            if txt.startswith("http"):
                return child.name
        return None

    def crawl_sitemap(self, sitemap_url, parent_id=None):
        """
        Recursively crawl a sitemap XML (or treat a non-XML as a page URL).
        Insert a doc into `sitemaps` for each sitemap found, linking parents ↔ children.
        """
        if sitemap_url in self.parsed_sitemaps:
            return

        # 1. Fetch + network metadata
        start = datetime.now(timezone.utc)
        resp, ctype = self._fetch(sitemap_url)
        elapsed = resp.elapsed.total_seconds()
        length  = len(resp.content)
        fetched_at = datetime.now(timezone.utc)

        # 2. Determine XML vs. page
        is_xml = ('xml' in ctype) or sitemap_url.lower().endswith('.xml')
        child_sitemaps = []
        page_links     = []

        if is_xml:
            soup = BeautifulSoup(resp.content, 'xml')
            tag = self._detect_url_tag(soup)
            if tag:
                for node in soup.find_all(tag):
                    link = node.get_text(strip=True)
                    if link.lower().endswith('.xml'):
                        child_sitemaps.append(link)
                    else:
                        page_links.append(link)
        else:
            page_links.append(sitemap_url)

        # 3. Insert this sitemap doc
        sitemap_doc = {
            "url": sitemap_url,
            "parent_id": parent_id,
            "child_sitemaps": [],    # will fill in as we recurse
            "page_links": page_links,
            "network_info": {
                "status_code": resp.status_code,
                "headers": dict(resp.headers),
                "cookies": resp.cookies.get_dict(),
                "elapsed_sec": elapsed,
                "content_length": length,
                "fetched_at": fetched_at
            }
        }
        result = self.sitemaps_col.insert_one(sitemap_doc)
        this_id = result.inserted_id

        # 4. Link into parent if exists
        if parent_id:
            self.sitemaps_col.update_one(
                {"_id": parent_id},
                {"$push": {"child_sitemaps": this_id}}
            )

        self.parsed_sitemaps.add(sitemap_url)
        self.page_urls.update(page_links)

        # 5. Recurse into child sitemaps
        for child in child_sitemaps:
            self.crawl_sitemap(child, parent_id=this_id)

    def fetch_and_store_pages(self):
        """Fetch every page URL, record network info, store in `pages`."""
        for url in sorted(self.page_urls):
            try:
                resp = requests.get(url, timeout=10)
                info = {
                    "url": url,
                    "status_code": resp.status_code,
                    "headers": dict(resp.headers),
                    "cookies": resp.cookies.get_dict(),
                    "elapsed_sec": resp.elapsed.total_seconds(),
                    "content_length": len(resp.content),
                    "final_url": resp.url,
                    "fetched_at": datetime.now(UTC)
                }
                self.pages_col.insert_one(info)
                print(f"[PAGE SAVED] {url}")
            except Exception as e:
                print(f"[PAGE ERROR] {url} → {e}")

    def run(self):
        try:
            # Crawl the sitemap(s)
            print(f"Starting crawl at: {self.start_url}")
            self.crawl_sitemap(self.start_url)
            print(f"Discovered {len(self.page_urls)} page URLs.")
        except Exception as e:
            print(f"Error in sitemap run: {e}")
            print(traceback.format_exc())
            # Ensure we have at least the starting URL
            if not self.page_urls:
                self.page_urls = set([self.start_url])

