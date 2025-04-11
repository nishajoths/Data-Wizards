import { useEffect, useState } from "react";
import { Card, Spinner, Button, Alert, Tabs, TabItem } from "flowbite-react";
import { Link, useParams } from "react-router-dom";
import Cookies from 'js-cookie';
import { 
  HiArrowLeft, 
  HiRefresh, 
  HiTable, 
  HiCode, 
  HiDownload,
  HiPhotograph,
  HiDocumentText,
  HiChevronRight  // Add this import
} from 'react-icons/hi';

interface ScrapeConfig {
  scrape_id: string;
  url: string;
  card_selector: string;
  pagination_selector: string | null;
  status: string;
  created_at: string;
  start_time?: string;
  end_time?: string;
  pages_scraped: number;
  items_found: number;
  errors: string[];
}

interface ScrapeResult {
  _id: string;
  scrape_id: string;
  page_number: number;
  item_number: number;
  url: string;
  data: any;
  html: string;
  timestamp: string;
}

interface ScrapeData {
  scrape: ScrapeConfig;
  results: ScrapeResult[];
}

export default function DynamicScraper() {
  const { scrapeId } = useParams<{ scrapeId: string }>();
  const [scrapeData, setScrapeData] = useState<ScrapeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const token = Cookies.get('token');
  
  const [paginationDetails, setPaginationDetails] = useState<{
    totalPages: number;
    currentPage: number;
    urlsDiscovered: string[];
    urlsProcessed: string[];
    paginationMethod: string;
  }>({
    totalPages: 0,
    currentPage: 0,
    urlsDiscovered: [],
    urlsProcessed: [],
    paginationMethod: 'unknown'
  });

  const fetchScrapeData = async () => {
    try {
      if (!scrapeId || !token) {
        throw new Error("Missing scrape ID or authentication token");
      }
      
      setLoading(true);
      console.log(`Fetching scrape data for ID: ${scrapeId}`);
      
      const response = await fetch(`http://localhost:8000/dynamic_scrapes/${scrapeId}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch scrape data: ${response.status}`);
      }
      
      const data = await response.json();
      setScrapeData(data);
      
      if (data?.scrape?.pagination_progress) {
        setPaginationDetails({
          totalPages: data.scrape.pages_scraped || 0,
          currentPage: data.scrape.pagination_progress.current_page || 0,
          urlsDiscovered: data.scrape.pagination_progress.urls_discovered || [],
          urlsProcessed: data.scrape.pagination_progress.urls_processed || [],
          paginationMethod: data.scrape.pagination_summary?.pagination_method || 'unknown'
        });
      }
      
      if (data?.scrape?.status === 'running' || data?.scrape?.status === 'queued') {
        setTimeout(fetchScrapeData, 3000);
      }
    } catch (err) {
      console.error("Error fetching scrape data:", err);
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    fetchScrapeData();
    
    const intervalId = setInterval(() => {
      if (scrapeData?.scrape?.status === 'running' || scrapeData?.scrape?.status === 'queued') {
        fetchScrapeData();
      }
    }, 5000);
    
    return () => clearInterval(intervalId);
  }, [scrapeId, token, scrapeData?.scrape?.status]);
  
  const downloadResults = () => {
    if (!scrapeData?.results) return;
    
    const exportData = scrapeData.results.map(result => ({
      page_number: result.page_number,
      item_number: result.item_number,
      url: result.url,
      ...result.data
    }));
    
    const dataStr = JSON.stringify(exportData, null, 2);
    const dataUri = `data:application/json;charset=utf-8,${encodeURIComponent(dataStr)}`;
    
    const exportFileDefaultName = `scrape-${scrapeId}-${new Date().toISOString().slice(0, 10)}.json`;
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };
  
  if (loading && !scrapeData) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Spinner size="xl" />
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Alert color="failure">
          <h3 className="font-medium">Error loading scrape data</h3>
          <p>{error}</p>
          <div className="mt-4">
            <Link to="/dashboard">
              <Button color="light">Return to Dashboard</Button>
            </Link>
          </div>
        </Alert>
      </div>
    );
  }
  
  if (!scrapeData) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Alert color="info">
          <p>Scrape data not found</p>
          <div className="mt-4">
            <Link to="/dashboard">
              <Button color="light">Return to Dashboard</Button>
            </Link>
          </div>
        </Alert>
      </div>
    );
  }
  
  const { scrape, results } = scrapeData;
  
  const getStatusColor = () => {
    switch (scrape.status) {
      case 'completed': return 'success';
      case 'running': return 'info';
      case 'queued': return 'warning';
      case 'error': return 'failure';
      default: return 'info';
    }
  };
  
  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString();
  };
  
  return (
    <div className="container mx-auto px-4 py-8">
      <Link to="/dashboard" className="flex items-center text-blue-600 hover:underline mb-6">
        <HiArrowLeft className="mr-2" /> Back to Dashboard
      </Link>
      
      <div className="flex flex-wrap items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dynamic Scraper</h1>
          <p className="text-gray-600">Scraping from: {scrape.url}</p>
        </div>
        <div className="flex gap-2">
          <Button color="light" onClick={fetchScrapeData}>
            <HiRefresh className="mr-2" />
            Refresh
          </Button>
          {results.length > 0 && (
            <Button color="success" onClick={downloadResults}>
              <HiDownload className="mr-2" />
              Download Results
            </Button>
          )}
        </div>
      </div>
      
      <Card className="mb-6">
        <Alert color={getStatusColor()} className="mb-4">
          <div className="font-medium flex items-center">
            Status: {scrape.status.toUpperCase()}
            {(scrape.status === 'running' || scrape.status === 'queued') && (
              <Spinner size="sm" className="ml-2" />
            )}
          </div>
          
          {scrape.status === 'running' && (
            <p className="mt-2">Scraping in progress. This page will update automatically.</p>
          )}
        </Alert>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h3 className="text-lg font-semibold mb-2">Scraping Details</h3>
            <div className="text-sm space-y-2">
              <div><span className="font-medium">Created:</span> {formatDate(scrape.created_at)}</div>
              <div><span className="font-medium">Started:</span> {formatDate(scrape.start_time)}</div>
              <div><span className="font-medium">Completed:</span> {formatDate(scrape.end_time)}</div>
              <div><span className="font-medium">Card Selector:</span> <code className="bg-gray-100 px-1 py-0.5 rounded">{scrape.card_selector}</code></div>
              <div><span className="font-medium">Pagination Selector:</span> {scrape.pagination_selector ? 
                <code className="bg-gray-100 px-1 py-0.5 rounded">{scrape.pagination_selector}</code> : 'None'}
              </div>
            </div>
          </div>
          
          <div>
            <h3 className="text-lg font-semibold mb-2">Statistics</h3>
            <div className="grid grid-cols-2 gap-4 text-center">
              <Card className="flex flex-col items-center justify-center">
                <div className="text-3xl font-bold text-blue-600">{scrape.pages_scraped}</div>
                <div className="text-sm text-gray-500">Pages Scraped</div>
              </Card>
              <Card className="flex flex-col items-center justify-center">
                <div className="text-3xl font-bold text-green-600">{scrape.items_found}</div>
                <div className="text-sm text-gray-500">Items Found</div>
              </Card>
            </div>
          </div>
        </div>
        
        {scrape.errors.length > 0 && (
          <div className="mt-4">
            <h3 className="text-lg font-semibold mb-2 text-red-700">Errors</h3>
            <ul className="list-disc pl-5 text-sm text-red-600">
              {scrape.errors.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          </div>
        )}
      </Card>
      
      <Tabs aria-label="Scrape data tabs">
        <TabItem
          title="Results"
          icon={HiTable}
          active={activeTab === 'results'}
          onClick={() => setActiveTab('results')}
        >
          {activeTab === 'results' && (
            <div className="overflow-x-auto">
              {results.length > 0 ? (
                <table className="w-full text-sm text-left text-gray-500">
                  <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                    <tr>
                      <th scope="col" className="px-4 py-3">#</th>
                      <th scope="col" className="px-4 py-3">Page</th>
                      <th scope="col" className="px-4 py-3">Text</th>
                      <th scope="col" className="px-4 py-3">Links</th>
                      <th scope="col" className="px-4 py-3">Images</th>
                      <th scope="col" className="px-4 py-3">Prices</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((result, index) => (
                      <tr key={result._id} className="bg-white border-b hover:bg-gray-50">
                        <td className="px-4 py-3">{result.item_number}</td>
                        <td className="px-4 py-3">{result.page_number}</td>
                        <td className="px-4 py-3">
                          {result.data.text_content.length > 100 
                            ? `${result.data.text_content.substring(0, 100)}...` 
                            : result.data.text_content}
                        </td>
                        <td className="px-4 py-3">
                          {result.data.links.length > 0 ? (
                            <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2 py-0.5 rounded">
                              {result.data.links.length} links
                            </span>
                          ) : 'None'}
                        </td>
                        <td className="px-4 py-3">
                          {result.data.images.length > 0 ? (
                            <span className="bg-purple-100 text-purple-800 text-xs font-medium px-2 py-0.5 rounded">
                              {result.data.images.length} images
                            </span>
                          ) : 'None'}
                        </td>
                        <td className="px-4 py-3">
                          {result.data.prices.length > 0 ? (
                            <span className="bg-green-100 text-green-800 text-xs font-medium px-2 py-0.5 rounded">
                              {result.data.prices.join(', ')}
                            </span>
                          ) : 'None'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-center py-4">
                  {scrape.status === 'running' || scrape.status === 'queued' ? (
                    <div className="flex flex-col items-center">
                      <Spinner size="xl" className="mb-4" />
                      <p className="text-gray-500">Scraping in progress...</p>
                    </div>
                  ) : (
                    <p className="text-gray-500">No results found</p>
                  )}
                </div>
              )}
            </div>
          )}
        </TabItem>
        
        <TabItem
          title="Images"
          icon={HiPhotograph}
          active={activeTab === 'images'}
          onClick={() => setActiveTab('images')}
        >
          {activeTab === 'images' && (
            <div>
              <h3 className="text-lg font-semibold mb-4">Extracted Images</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {results.flatMap(result => 
                  result.data.images.map((image: any, imgIndex: number) => (
                    <div key={`${result._id}-${imgIndex}`} className="group">
                      <div className="aspect-square bg-gray-100 rounded overflow-hidden">
                        <img 
                          src={image.src} 
                          alt={image.alt || "Scraped image"}
                          className="w-full h-full object-cover transition-transform group-hover:scale-105"
                          onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                            const target = e.target as HTMLImageElement;
                            target.src = "https://via.placeholder.com/150?text=Image+Error";
                          }}
                          loading="lazy"
                        />
                      </div>
                      <div className="mt-2 text-xs text-gray-500 truncate">
                        {image.alt || "No description"}
                      </div>
                    </div>
                  ))
                )}
                
                {results.flatMap(result => result.data.images).length === 0 && (
                  <div className="col-span-full text-center py-10">
                    <p className="text-gray-500">No images found in the scraped data</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </TabItem>
        
        <TabItem
          title="Raw Data"
          icon={HiCode}
          active={activeTab === 'raw'}
          onClick={() => setActiveTab('raw')}
        >
          {activeTab === 'raw' && (
            <div>
              <h3 className="text-lg font-semibold mb-4">Raw Scraped Data</h3>
              <div className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-auto max-h-[500px]">
                <pre>{JSON.stringify(results, null, 2)}</pre>
              </div>
            </div>
          )}
        </TabItem>
        
        <TabItem
          title="HTML"
          icon={HiDocumentText}
          active={activeTab === 'html'}
          onClick={() => setActiveTab('html')}
        >
          {activeTab === 'html' && (
            <div>
              <h3 className="text-lg font-semibold mb-4">HTML of First 5 Items</h3>
              <div className="space-y-4">
                {results.slice(0, 5).map((result, index) => (
                  <Card key={result._id}>
                    <div className="flex justify-between items-center mb-2">
                      <h4 className="text-md font-medium">Item #{result.item_number} (Page {result.page_number})</h4>
                    </div>
                    <div className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-auto max-h-[200px]">
                      <pre className="text-xs">{result.html}</pre>
                    </div>
                  </Card>
                ))}
                
                {results.length === 0 && (
                  <div className="text-center py-10">
                    <p className="text-gray-500">No HTML content available</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </TabItem>
        
        <TabItem
          title="Pagination"
          icon={HiChevronRight}
          active={activeTab === 'pagination'}
          onClick={() => setActiveTab('pagination')}
        >
          {activeTab === 'pagination' && (
            <div>
              <h3 className="text-lg font-semibold mb-4">Pagination Details</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <Card>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-blue-600">{paginationDetails.totalPages}</div>
                    <div className="text-sm text-gray-500">Total Pages Scraped</div>
                  </div>
                </Card>
                
                <Card>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-green-600">{paginationDetails.urlsDiscovered.length}</div>
                    <div className="text-sm text-gray-500">URLs Discovered</div>
                  </div>
                </Card>
                
                <Card>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-purple-600 capitalize">{paginationDetails.paginationMethod}</div>
                    <div className="text-sm text-gray-500">Pagination Method</div>
                  </div>
                </Card>
              </div>
              
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium text-gray-700 mb-2">URLs Processed</h4>
                  <div className="bg-gray-50 p-3 rounded-lg max-h-64 overflow-y-auto">
                    {paginationDetails.urlsProcessed.length > 0 ? (
                      <ol className="list-decimal list-inside space-y-1">
                        {paginationDetails.urlsProcessed.map((url, index) => (
                          <li key={index} className="text-sm truncate hover:text-clip hover:overflow-visible">
                            <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                              {url}
                            </a>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="text-gray-500 italic">No URLs processed yet</p>
                    )}
                  </div>
                </div>
                
                <div>
                  <h4 className="font-medium text-gray-700 mb-2">Pagination Flow</h4>
                  <div className="bg-gray-50 p-3 rounded-lg">
                    {paginationDetails.urlsDiscovered.length > 0 ? (
                      <div className="flex flex-col gap-2">
                        {paginationDetails.urlsDiscovered.map((url, index) => (
                          <div key={index} className="flex items-center">
                            <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center font-medium mr-3">
                              {index + 1}
                            </div>
                            <div className="flex-1 truncate">
                              <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-sm">
                                {url}
                              </a>
                            </div>
                            {index < paginationDetails.urlsDiscovered.length - 1 && (
                              <div className="h-8 border-l-2 border-blue-200 ml-4 mt-8"></div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-gray-500 italic">No pagination links discovered yet</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </TabItem>
      </Tabs>
    </div>
  );
}
