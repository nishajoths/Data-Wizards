import { useEffect, useState } from "react";
import { Card, Button, Spinner, Alert } from "flowbite-react";
import { Link } from "react-router-dom";
import Cookies from 'js-cookie';
import { 
  HiExternalLink, 
  HiRefresh, 
  HiPlus, 
  HiInformationCircle,
  HiCheck,
  HiClock,
  HiX
} from 'react-icons/hi';

interface DynamicScrape {
  _id: string;
  scrape_id: string;
  user_email: string;
  url: string;
  card_selector: string;
  pagination_selector: string | null;
  status: string;
  created_at: string;
  pages_scraped: number;
  items_found: number;
}

export default function DynamicScraperList() {
  const [scrapes, setScrapes] = useState<DynamicScrape[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const token = Cookies.get('token');
  
  const fetchScrapes = async () => {
    if (!token) {
      setError("Authentication token not found");
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      const response = await fetch('http://localhost:8000/dynamic_scrapes', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch scrapes: ${response.status}`);
      }
      
      const data = await response.json();
      setScrapes(data.scrapes || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unknown error occurred");
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    fetchScrapes();
  }, []);
  
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <HiCheck className="w-5 h-5 text-green-500" />;
      case 'running':
        return <Spinner size="sm" className="text-blue-500" />;
      case 'queued':
        return <HiClock className="w-5 h-5 text-yellow-500" />;
      case 'error':
        return <HiX className="w-5 h-5 text-red-500" />;
      default:
        return <HiInformationCircle className="w-5 h-5 text-gray-500" />;
    }
  };
  
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };
  
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dynamic Scraper</h1>
          <p className="text-gray-600">Use the browser extension to visually select elements to scrape</p>
        </div>
        <div className="flex gap-2">
          <Button color="light" onClick={fetchScrapes}>
            <HiRefresh className="mr-2" />
            Refresh
          </Button>
        </div>
      </div>
      
      {error && (
        <Alert color="failure" className="mb-4">
          <h3 className="font-medium">Error loading scrapes</h3>
          <p>{error}</p>
        </Alert>
      )}
      
      <Card className="mb-6">
        <div className="p-4 bg-blue-50 border border-blue-100 rounded-lg">
          <h2 className="text-xl font-semibold text-blue-800 mb-2">How to use the Dynamic Scraper</h2>
          <ol className="list-decimal pl-5 space-y-2 text-blue-700">
            <li>Install the browser extension from the extension directory</li>
            <li>Navigate to any website you want to scrape</li>
            <li>Click the extension icon and then "Start Element Selection"</li>
            <li>Select a card element (product, article, etc.) by clicking on it</li>
            <li>Select a pagination element (optional) if you want to scrape multiple pages</li>
            <li>Click "Start Scraping" to begin the scraping process</li>
          </ol>
        </div>
      </Card>
      
      <h2 className="text-2xl font-bold mb-4">Your Scraping Jobs</h2>
      
      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner size="xl" />
        </div>
      ) : (
        <div>
          {scrapes.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-lg">
              <h3 className="text-xl font-semibold text-gray-700">No scraping jobs yet</h3>
              <p className="text-gray-500 mb-6">Use the browser extension to start scraping</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {scrapes.map((scrape) => (
                <Card key={scrape._id}>
                  <div className="flex justify-between">
                    <div className="flex items-center">
                      {getStatusIcon(scrape.status)}
                      <span className="ml-2 font-medium capitalize">{scrape.status}</span>
                    </div>
                    <div className="text-sm text-gray-500">
                      {formatDate(scrape.created_at)}
                    </div>
                  </div>
                  
                  <h3 className="text-lg font-semibold mt-2 truncate" title={scrape.url}>
                    {new URL(scrape.url).hostname}
                  </h3>
                  
                  <div className="mt-2 text-sm text-gray-600">
                    <div>Pages scraped: {scrape.pages_scraped}</div>
                    <div>Items found: {scrape.items_found}</div>
                  </div>
                  
                  <div className="mt-3 text-xs text-gray-500 truncate">
                    <div><span className="font-medium">Card selector:</span> {scrape.card_selector}</div>
                    <div><span className="font-medium">Pagination:</span> {scrape.pagination_selector || 'None'}</div>
                  </div>
                  
                  <div className="mt-4">
                    <Link to={`/dynamic-scrape/${scrape.scrape_id}`}>
                      <Button color="blue" className="w-full">
                        <HiExternalLink className="mr-2" />
                        View Results
                      </Button>
                    </Link>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
