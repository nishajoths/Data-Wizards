import requests
from urllib.robotparser import RobotFileParser
import xml.etree.ElementTree as ET
from pymongo import MongoClient
from urllib.parse import urljoin, urlparse
import re
from bs4 import BeautifulSoup
import logging
from datetime import datetime, timedelta

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

class SitemapCrawler:
    def __init__(self, domain, mongo_uri="mongodb://localhost:27017/", db_name="crawler_db"):
        # Normalize domain
        self.domain = domain if domain.startswith("http") else f"https://{domain}"
        self.parsed = urlparse(self.domain)
        # MongoDB setup
        client = MongoClient(mongo_uri)
        self.db = client[db_name]
        self.robots_col = self.db.robots
        self.sitemaps_col = self.db.sitemaps
        self.pages_col = self.db.pages
        self.xml_data_col = self.db.xml_data
        self.already_col = self.db.already
        self.internships_col = self.db.internships
        self.max_age_days = 1  # Only process entries less than 1 day old
        self.classifier = None
        # Placeholder for RobotFileParser
        self.rp = None
        self.robots_doc_id = None
        # Track visited URLs to avoid infinite loops
        self.visited_urls = set()
    
    def fetch_robots(self):
        """Fetch robots.txt, extract sitemaps and disallow rules."""
        robots_url = urljoin(self.domain, "/robots.txt")
        # Parse for allow/disallow
        rp = RobotFileParser()
        rp.set_url(robots_url)
        rp.read()
        self.rp = rp

        txt = requests.get(robots_url).text
        lines = txt.splitlines()

        # Extract Sitemap entries
        sitemaps = [line.split(":",1)[1].strip()
                    for line in lines
                    if line.lower().startswith("sitemap:")]

        # Fallback to default sitemap locations if none in robots.txt
        if not sitemaps:
            for candidate in ("/sitemap.xml", "/sitemap"):
                url = urljoin(self.domain, candidate)
                resp = requests.head(url)
                if resp.status_code == 200 and 'xml' in resp.headers.get('Content-Type', ''):
                    sitemaps.append(url)

        # If no sitemaps found in robots.txt or default locations, add the domain as a fallback
        if not sitemaps:
            logging.info(f"No sitemap found for {self.domain}, will crawl from homepage")
            sitemaps.append(self.domain)

        # Extract Disallow rules
        disallows = [line.split(":",1)[1].strip()
                     for line in lines
                     if line.lower().startswith("disallow:")]

        # Store robots doc
        res = self.robots_col.insert_one({
            "domain": self.parsed.netloc,
            "robots_url": robots_url,
            "sitemaps": sitemaps,
            "disallow_rules": disallows,
            # placeholders; will update later
            "disabled_pages": [],
            "disabled_count": 0
        })
        self.robots_doc_id = res.inserted_id
        return sitemaps

    def is_xml_content(self, content):
        """Check if the content is XML."""
        try:
            ET.fromstring(content)
            return True
        except ET.ParseError:
            return False
    
    def set_classifier(self, classifier):
        """Set a classifier for categorizing content."""
        self.classifier = classifier
    
    def is_recent_enough(self, lastmod_date):
        """Check if the last modification date is recent enough to process."""
        if self.max_age_days is None:
            return True
            
        if not lastmod_date:
            return True
            
        try:
            current_date = datetime.now(lastmod_date.tzinfo)
            difference = current_date - lastmod_date
            return difference.days < self.max_age_days
        except Exception as e:
            logging.warning(f"Error checking date: {str(e)}")
            return True
    
    def extract_xml_links(self, url, content):
        """Extract links from XML content using BeautifulSoup with lxml."""
        links = []
        try:
            soup = BeautifulSoup(content, 'lxml-xml')
            for text in soup.find_all(text=True):
                text = text.strip()
                if text.startswith('http://') or text.startswith('https://'):
                    links.append(text)
            
            for tag in soup.find_all(attrs={'href': True}):
                href = tag['href']
                if href.startswith('http') or href.startswith('//'):
                    links.append(href if href.startswith('http') else f"https:{href}")
                else:
                    links.append(urljoin(url, href))
            
            for loc in soup.find_all('loc'):
                if loc.text:
                    links.append(loc.text.strip())
            
            url_attrs = ['href', 'src', 'url', 'link', 'location']
            for attr in url_attrs:
                for tag in soup.find_all(attrs={attr: True}):
                    href = tag[attr]
                    if href.startswith('http') or href.startswith('//'):
                        links.append(href if href.startswith('http') else f"https:{href}")
                    else:
                        links.append(urljoin(url, href))
                        
            links = list(set(links))
            
        except Exception as e:
            logging.warning(f"Error parsing XML from {url} with BeautifulSoup: {str(e)}")
            try:
                root = ET.fromstring(content)
                ns = {'ns': 'http://www.sitemaps.org/schemas/sitemap/0.9'}
                
                for sitemap in root.findall('.//ns:sitemap/ns:loc', ns) + root.findall('.//sitemap/loc', {}) + root.findall('.//loc', {}):
                    if sitemap.text:
                        links.append(sitemap.text)
                
                for url_elem in root.findall('.//ns:url/ns:loc', ns) + root.findall('.//url/loc', {}) + root.findall('.//loc', {}):
                    if url_elem.text:
                        links.append(url_elem.text)
                
                if not links:
                    for elem in root.iter():
                        if elem.text and (elem.text.startswith('http://') or elem.text.startswith('https://')):
                            links.append(elem.text)
                            
            except Exception as e:
                logging.warning(f"Error in fallback XML parsing from {url}: {str(e)}")
        
        return links
    
    def parse_lastmod_date(self, element):
        """Extract lastmod date from XML element."""
        try:
            lastmod = element.find('lastmod') or element.find('ns:lastmod', {'ns': 'http://www.sitemaps.org/schemas/sitemap/0.9'})
            
            if lastmod is not None and lastmod.text:
                date_formats = [
                    '%Y-%m-%dT%H:%M:%S%z',
                    '%Y-%m-%dT%H:%M:%S',
                    '%Y-%m-%d',
                ]
                
                for fmt in date_formats:
                    try:
                        return datetime.strptime(lastmod.text, fmt)
                    except ValueError:
                        continue
                        
            return None
        except Exception as e:
            logging.warning(f"Error parsing lastmod date: {str(e)}")
            return None
    
    def parse_internship_details(self, url, html_content):
        """Extract internship details from HTML content."""
        try:
            soup = BeautifulSoup(html_content, 'html.parser')
            
            try:
                title = soup.select_one(".heading_2_4.heading_title").get_text(strip=True)
            except Exception:
                title = soup.title.string if soup.title else None
                
            company = dict()
            try:
                company_logo = soup.select_one(".internship_logo img")
                company['logo'] = company_logo['src'] if company_logo else None
            except:
                company['logo'] = None
                
            try:
                company['name'] = soup.select_one(".company").text.strip()
                company['name'] = re.sub(r'\n+', '\n', company['name']).replace("\n","<br/>")
            except:
                company['name'] = None
                
            try:
                loc = soup.select_one("#location_names").get_text(strip=True)
            except:
                loc = None
                
            try:
                details = soup.select_one(".internship_other_details_container").get_text(strip=True)
            except:
                details = None
                
            try:
                tags = soup.select_one(".tags_container_outer").get_text(strip=True)
                details = (details or "") + " " + tags
            except:
                pass
                
            try:
                desc = str(soup.select_one(".text-container").prettify()) + "<br/><b>Skills Required</b><br/>" + str(soup.select_one(".round_tabs_container").text.replace("\n","<br/>"))
            except:
                desc = None
                
            category = "Others"
            if self.classifier:
                try:
                    category, score = self.classifier.classify(url)
                    logging.info(f"Classification: {category} (score: {score})")
                    if score < 0.5:
                        category = "Others"
                except Exception as e:
                    logging.error(f"Classification error: {str(e)}")
            
            return {
                "title": title,
                "link": url,
                "location": loc,
                "description": desc,
                "company": company,
                "category": category,
                "by": urlparse(url).netloc,
            }
        except Exception as e:
            logging.error(f"Error parsing internship details: {str(e)}")
            return None
    
    def process_xml_content(self, url, content, parent_id, depth):
        """Process XML content, extract links and crawl recursively."""
        try:
            xml_data = self.extract_xml_data(url, content)
            soup = BeautifulSoup(content, 'xml')
            
            url_tags = soup.find_all('url')
            if url_tags:
                for url_tag in url_tags:
                    loc_elem = url_tag.find('loc')
                    if not loc_elem or not loc_elem.text:
                        continue
                        
                    loc_url = loc_elem.text.strip()
                    lastmod_elem = url_tag.find('lastmod')
                    lastmod_date = None
                    
                    if lastmod_elem and lastmod_elem.text:
                        try:
                            lastmod_date = datetime.strptime(lastmod_elem.text, '%Y-%m-%dT%H:%M:%S%z')
                        except ValueError:
                            try:
                                lastmod_date = datetime.strptime(lastmod_elem.text, '%Y-%m-%d')
                            except ValueError:
                                logging.warning(f"Could not parse lastmod date: {lastmod_elem.text}")
                    
                    if self.already_col.find_one({"link": loc_url}):
                        logging.info(f"Already processed URL: {loc_url}")
                        continue
                    
                    if not self.is_recent_enough(lastmod_date):
                        logging.info(f"Skipping old entry: {loc_url}, lastmod: {lastmod_date}")
                        continue
                    
                    logging.info(f"Processing URL: {loc_url}")
                    child_id = self.crawl_sitemap(loc_url, parent_id=parent_id, depth=depth+1, lastmod_date=lastmod_date)
                    
                    self.already_col.insert_one({"link": loc_url})
                
                doc = {
                    "sitemap_url": url,
                    "type": "urlset",
                    "parent": parent_id,
                    "xml_data": xml_data
                }
                res = self.sitemaps_col.insert_one(doc)
                return res.inserted_id
                
        except Exception as e:
            logging.error(f"Error in process_xml_content: {str(e)}")
    
    def process_html_content(self, url, content, parent_id, lastmod_date=None):
        """Process HTML content, extract internship details if possible."""
        if self.already_col.find_one({"link": url}):
            logging.info(f"Already processed URL: {url}")
            return None
            
        links = self.extract_html_links(url, content)
        
        internship_data = self.parse_internship_details(url, content)
        
        if internship_data:
            if lastmod_date:
                internship_data["date"] = lastmod_date
            else:
                internship_data["date"] = datetime.now()
                
            self.internships_col.insert_one(internship_data)
            logging.info(f"Stored internship: {internship_data['title']}")
            
            self.already_col.insert_one({"link": url})
        
        doc = {
            "url": url,
            "type": "html",
            "parent": parent_id,
            "links": links,
            "is_internship": bool(internship_data)
        }
        res = self.pages_col.insert_one(doc)
        return res.inserted_id
    
    def crawl_sitemap(self, sitemap_url, parent_id=None, depth=0, max_depth=10, lastmod_date=None):
        """Parse a sitemap (or index), recurse or store URLs."""
        if sitemap_url in self.visited_urls or depth > max_depth:
            return None
        
        if self.already_col.find_one({"link": sitemap_url}):
            logging.info(f"Already processed URL: {sitemap_url}")
            return None
            
        self.visited_urls.add(sitemap_url)
        logging.info(f"Crawling: {sitemap_url} (depth: {depth})")
        
        try:
            resp = requests.get(sitemap_url, timeout=10)
            if resp.status_code != 200:
                logging.warning(f"Failed to fetch {sitemap_url}, status code: {resp.status_code}")
                return None
            
            content = resp.content
            content_type = resp.headers.get('Content-Type', '')
            
            is_xml = self.is_xml_content(content) or 'xml' in content_type.lower()
            
            if is_xml:
                return self.process_xml_content(sitemap_url, content, parent_id, depth)
            else:
                return self.process_html_content(sitemap_url, content, parent_id, lastmod_date)
                
        except requests.RequestException as e:
            logging.error(f"Request error for {sitemap_url}: {str(e)}")
            return None
        except Exception as e:
            logging.error(f"Error processing {sitemap_url}: {str(e)}")
            return None
    
    def mark_disabled_pages(self):
        """Check all pages against robots rules, collect disallowed ones."""
        disabled = []
        for page in self.pages_col.find({"parent_sitemap": {"$exists": True}}):
            url = page["url"]
            if not self.rp.can_fetch("*", url):
                disabled.append(url)
        self.robots_col.update_one(
            {"_id": self.robots_doc_id},
            {"$set": {
                "disabled_pages": disabled,
                "disabled_count": len(disabled)
            }}
        )

    def run(self, start_url=None):
        """Run the crawler."""
        if not start_url:
            sitemaps = self.fetch_robots()
        else:
            sitemaps = [start_url]
            
        for sm in sitemaps:
            self.crawl_sitemap(sm)
            
        self.mark_disabled_pages()
        
        print("Crawling complete.")
        
        info = self.robots_col.find_one({"_id": self.robots_doc_id}) if self.robots_doc_id else None
        if info:
            print(f"Found {len(info['sitemaps'])} sitemap(s), "
                  f"{info['disabled_count']} disallowed page(s).")
        
        print(f"Total pages discovered: {self.pages_col.count_documents({})}")
        print(f"Internships collected: {self.internships_col.count_documents({})}")
        print(f"XML documents collected: {self.xml_data_col.count_documents({})}")
        print(f"Already processed URLs: {self.already_col.count_documents({})}")

if __name__ == "__main__":
    crawler = SitemapCrawler("internshala.com")
    crawler.run()
