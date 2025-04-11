import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Card, Spinner, Button, Alert, Tabs, Accordion, TabItem, AccordionPanel, AccordionTitle, AccordionContent } from "flowbite-react";
import Cookies from 'js-cookie';
import { 
  HiArrowLeft, HiLink, HiGlobe, HiExclamationCircle, 
  HiCheck, HiCode, HiDocumentText, HiTable, HiOutlineCog,
  HiChartPie, HiDocumentDuplicate, HiPhotograph, HiTemplate
} from 'react-icons/hi';

// Interface for robots.txt rules
interface RobotsRule {
  path: string;
  permission: boolean;
}

// Interface for robots.txt data 
interface RobotsData {
  _id: string;
  domain: string;
  rules: RobotsRule[];
  sitemaps: string[];
  cookies: Record<string, string>;
  created_at: string;
  request_info: {
    status_code: number;
    headers: Record<string, string>;
    encoding: string;
    final_url: string;
  };
}

// Interface for page content items (paragraphs, images, etc.)
interface PageContent {
  type: string;
  content?: string;
  url?: string;
  alt_text?: string;
  extracted_text?: string;
  image_url?: string;
  error?: string;
}

// Interface for structured content from scraped pages
interface ScrapedContent {
  _id: string;
  url: string;
  content: {
    text_content: PageContent[];
    images: PageContent[];
    image_texts: PageContent[];
    orders: any[];
  };
}

// Interface for processing status
interface ProcessingStatus {
  robots_status: string;
  sitemap_status: string;
  pages_found: number;
  pages_scraped: number;
  errors: string[];
}

// Main interface for complete project data
interface CompleteProjectData {
  _id: string;
  url: string;
  title?: string;
  user_email: string;
  site_data: {
    robots_id: string | null;
    sitemap_pages: string[];
    scraped_pages: string[];
  };
  processing_status: ProcessingStatus;
  created_at: string;
  related_data: {
    robots_data: RobotsData | null;
    scraped_content: ScrapedContent[];
  };
}

export default function ProjectDetails() {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<CompleteProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const token = Cookies.get('token');
  const [activeTab, setActiveTab] = useState('overview');
  const [showRequestInfo, setShowRequestInfo] = useState(false);
  const [showFullSitemapInfo, setShowFullSitemapInfo] = useState(false);

  useEffect(() => {
    const fetchProject = async () => {
      try {
        if (!projectId || !token) {
          throw new Error("Missing project ID or authentication token");
        }
        
        setLoading(true);
        console.log(`Fetching complete project with ID: ${projectId}`);
        
        // Fetch the complete project data from our backend API
        const res = await fetch(`http://localhost:8000/projects/${projectId}/complete`, {
          headers: {
            Authorization: `Bearer ${token}`
          },
        });
        
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({ detail: "Failed to parse error response" }));
          console.error("Error response:", errorData);
          throw new Error(errorData.detail || `Failed to fetch project (${res.status})`);
        }
        
        const data = await res.json();
        console.log("Complete project data:", data);
        setProject(data);
      } catch (err) {
        console.error("Error fetching project:", err);
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setLoading(false);
      }
    };

    fetchProject();
  }, [projectId, token]);

  // Loading state
  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Spinner size="xl" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Alert color="failure">
          <h3 className="font-medium">Error loading project</h3>
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

  // No project state
  if (!project) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Alert color="info">
          <p>Project not found</p>
          <div className="mt-4">
            <Link to="/dashboard">
              <Button color="light">Return to Dashboard</Button>
            </Link>
          </div>
        </Alert>
      </div>
    );
  }

  // Access properties safely with fallbacks
  const title = project.title || `Project for ${project.url || "Unknown URL"}`;
  const url = project.url || "";
  const site_data = project.site_data || { robots_id: null, sitemap_pages: [], scraped_pages: [] };
  const processing_status = project.processing_status || { 
    robots_status: "unknown", 
    sitemap_status: "unknown", 
    pages_found: 0, 
    pages_scraped: 0, 
    errors: [] 
  };
  const robots_data = project.related_data?.robots_data || null;
  const scraped_content = project.related_data?.scraped_content || [];
  const createdDate = project.created_at ? new Date(project.created_at).toLocaleString() : "Unknown date";

  // Helper function to get status color
  const getStatusColor = (status: string) => {
    if (status === 'success') return 'text-green-500';
    if (status === 'error' || status === 'failed') return 'text-red-500';
    return 'text-yellow-500';
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <Link to="/dashboard" className="flex items-center text-blue-600 hover:underline mb-6">
        <HiArrowLeft className="mr-2" /> Back to Dashboard
      </Link>
      
      {/* Header Section */}
      <div className="flex flex-wrap items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{title}</h1>
          <p className="text-gray-600">Created on {createdDate}</p>
        </div>
      </div>
      
      {/* URL Card */}
      <Card className="mb-6">
        <div className="flex items-center gap-3">
          <HiGlobe className="text-blue-600 w-8 h-8" />
          <div className="flex-1">
            <h2 className="text-xl font-bold">Website URL</h2>
            <a 
              href={url} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline flex items-center gap-1"
            >
              {url} <HiLink className="inline" />
            </a>
          </div>
        </div>
      </Card>
      
      {/* Data Relationship Visualization */}
      <Card className="mb-6">
        <h3 className="text-lg font-bold mb-4">Data Chain Visualization</h3>
        <div className="relative overflow-auto p-4 bg-gray-50 rounded-lg">
          <div className="flex flex-col items-center">
            {/* Project Node */}
            <div className="border-2 border-blue-500 rounded-lg p-3 bg-blue-50 w-64 text-center">
              <h4 className="font-bold text-blue-700">Project</h4>
              <p className="text-sm">ID: {project._id.substring(0, 8)}...</p>
            </div>
            
            {/* Connection Line */}
            <div className="h-8 w-px bg-gray-400 my-1"></div>
            
            {/* Branches */}
            <div className="flex justify-center items-start w-full gap-8">
              {/* Robots.txt Branch */}
              <div className="flex flex-col items-center">
                <div className="h-8 w-px bg-gray-400"></div>
                <div className={`border-2 ${robots_data ? 'border-green-500 bg-green-50' : 'border-red-300 bg-red-50'} rounded-lg p-3 w-52 text-center`}>
                  <h4 className="font-bold text-gray-700">Robots.txt</h4>
                  <p className="text-xs">
                    {robots_data ? (
                      <span className="text-green-600">Found with {robots_data.rules.length} rules</span>
                    ) : (
                      <span className="text-red-600">Not available</span>
                    )}
                  </p>
                </div>
              </div>
              
              {/* Sitemap Branch */}
              <div className="flex flex-col items-center">
                <div className="h-8 w-px bg-gray-400"></div>
                <div className={`border-2 ${site_data.sitemap_pages.length > 0 ? 'border-green-500 bg-green-50' : 'border-red-300 bg-red-50'} rounded-lg p-3 w-52 text-center`}>
                  <h4 className="font-bold text-gray-700">Sitemap</h4>
                  <p className="text-xs">
                    {site_data.sitemap_pages.length > 0 ? (
                      <span className="text-green-600">{site_data.sitemap_pages.length} pages found</span>
                    ) : (
                      <span className="text-red-600">No pages found</span>
                    )}
                  </p>
                </div>
                
                {/* Pages Branch - Only show if sitemap has pages */}
                {site_data.sitemap_pages.length > 0 && (
                  <>
                    <div className="h-8 w-px bg-gray-400 my-1"></div>
                    <div className="border-2 border-blue-300 rounded-lg p-3 w-52 text-center bg-blue-50">
                      <h4 className="font-bold text-gray-700">Pages</h4>
                      <p className="text-xs text-blue-600">{site_data.sitemap_pages.length} pages discovered</p>
                    </div>
                  </>
                )}
              </div>
              
              {/* Content Branch */}
              <div className="flex flex-col items-center">
                <div className="h-8 w-px bg-gray-400"></div>
                <div className={`border-2 ${scraped_content.length > 0 ? 'border-green-500 bg-green-50' : 'border-red-300 bg-red-50'} rounded-lg p-3 w-52 text-center`}>
                  <h4 className="font-bold text-gray-700">Scraped Content</h4>
                  <p className="text-xs">
                    {scraped_content.length > 0 ? (
                      <span className="text-green-600">{scraped_content.length} pages scraped</span>
                    ) : (
                      <span className="text-red-600">No content scraped</span>
                    )}
                  </p>
                </div>
                
                {/* Content Items Branch - Only show if content exists */}
                {scraped_content.length > 0 && (
                  <>
                    <div className="h-8 w-px bg-gray-400 my-1"></div>
                    <div className="flex gap-2">
                      <div className="border-2 border-purple-300 rounded-lg p-2 text-center bg-purple-50">
                        <h4 className="font-bold text-xs text-gray-700">Text</h4>
                        <p className="text-xs text-purple-600">
                          {scraped_content.reduce((sum, page) => sum + (page.content.text_content?.length || 0), 0)} items
                        </p>
                      </div>
                      
                      <div className="border-2 border-pink-300 rounded-lg p-2 text-center bg-pink-50">
                        <h4 className="font-bold text-xs text-gray-700">Images</h4>
                        <p className="text-xs text-pink-600">
                          {scraped_content.reduce((sum, page) => sum + (page.content.images?.length || 0), 0)} items
                        </p>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </Card>
      
      {/* Tabs for detailed information */}
      <Tabs 
        aria-label="Project tabs" 
        className="underline"
        onActiveTabChange={tabIndex => setActiveTab(['overview', 'robots', 'pages', 'content', 'data-flow'][tabIndex])}
      >
        {/* Overview Tab */}
        <TabItem 
          title="Overview" 
          icon={HiOutlineCog}
          active={activeTab === 'overview'}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
            <Card>
              <h3 className="text-lg font-semibold mb-2">Processing Status</h3>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${getStatusColor(processing_status.robots_status)}`}></div>
                  <span>Robots.txt: {processing_status.robots_status}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${getStatusColor(processing_status.sitemap_status)}`}></div>
                  <span>Sitemap: {processing_status.sitemap_status}</span>
                </div>
                <div className="text-sm text-gray-600">
                  Pages found: {processing_status.pages_found}
                </div>
                <div className="text-sm text-gray-600">
                  Pages scraped: {processing_status.pages_scraped}
                </div>
              </div>
            </Card>

            <Card>
              <h3 className="text-lg font-semibold mb-2">Website Analysis</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span>Total Pages:</span>
                  <span className="font-medium">{site_data.sitemap_pages?.length || 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Scraped Pages:</span>
                  <span className="font-medium">{site_data.scraped_pages?.length || 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Robots Rules:</span>
                  <span className="font-medium">{robots_data?.rules?.length || 0}</span>
                </div>
              </div>
            </Card>

            <Card>
              <h3 className="text-lg font-semibold mb-2">Content Summary</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span>Text Paragraphs:</span>
                  <span className="font-medium">
                    {scraped_content.reduce((sum, page) => 
                      sum + (page.content.text_content?.length || 0), 0)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Images:</span>
                  <span className="font-medium">
                    {scraped_content.reduce((sum, page) => 
                      sum + (page.content.images?.length || 0), 0)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Image Text Extractions:</span>
                  <span className="font-medium">
                    {scraped_content.reduce((sum, page) => 
                      sum + (page.content.image_texts?.length || 0), 0)}
                  </span>
                </div>
              </div>
            </Card>
          </div>
          
          {/* Progress Indicators */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <Card>
              <h3 className="text-lg font-semibold mb-2">Pages Discovery Progress</h3>
              <div className="h-4 w-full bg-gray-200 rounded-full overflow-hidden">
                <div 
                  className="h-4 bg-blue-600 rounded-full" 
                  style={{ width: `${processing_status.pages_scraped ? (processing_status.pages_scraped / processing_status.pages_found * 100) : 0}%` }}
                ></div>
              </div>
              <div className="flex justify-between mt-1 text-sm text-gray-600">
                <span>0%</span>
                <span>{processing_status.pages_scraped ? Math.round(processing_status.pages_scraped / processing_status.pages_found * 100) : 0}%</span>
                <span>100%</span>
              </div>
            </Card>
            
            <Card>
              <h3 className="text-lg font-semibold mb-2">Data Collection by Type</h3>
              <div className="flex gap-2 flex-wrap">
                <div className="border rounded p-2 bg-blue-50 flex-1 text-center">
                  <div className="text-xl font-bold text-blue-700">
                    {site_data.sitemap_pages?.length || 0}
                  </div>
                  <div className="text-xs text-gray-600">Pages</div>
                </div>
                <div className="border rounded p-2 bg-green-50 flex-1 text-center">
                  <div className="text-xl font-bold text-green-700">
                    {robots_data?.rules?.length || 0}
                  </div>
                  <div className="text-xs text-gray-600">Robot Rules</div>
                </div>
                <div className="border rounded p-2 bg-purple-50 flex-1 text-center">
                  <div className="text-xl font-bold text-purple-700">
                    {scraped_content.reduce((sum, page) => 
                      sum + (page.content.text_content?.length || 0), 0)}
                  </div>
                  <div className="text-xs text-gray-600">Text Elements</div>
                </div>
                <div className="border rounded p-2 bg-pink-50 flex-1 text-center">
                  <div className="text-xl font-bold text-pink-700">
                    {scraped_content.reduce((sum, page) => 
                      sum + (page.content.images?.length || 0), 0)}
                  </div>
                  <div className="text-xs text-gray-600">Images</div>
                </div>
              </div>
            </Card>
          </div>
          
          {/* Errors Section */}
          {processing_status.errors && processing_status.errors.length > 0 && (
            <Alert color="warning" className="mb-6">
              <h4 className="font-medium">Issues encountered during processing:</h4>
              <ul className="list-disc pl-5 mt-2">
                {processing_status.errors.map((err, index) => (
                  <li key={index}>{err}</li>
                ))}
              </ul>
            </Alert>
          )}
        </TabItem>

        {/* Robots.txt Tab */}
        <TabItem 
          title="Robots.txt" 
          icon={HiCode}
          active={activeTab === 'robots'}
        >
          {robots_data ? (
            <div className="space-y-6">
              <Card>
                <h3 className="text-lg font-semibold mb-4">Robots.txt Information</h3>
                <div className="space-y-3">
                  <div>
                    <h4 className="font-medium text-gray-700">Domain</h4>
                    <p>{robots_data.domain}</p>
                  </div>
                  
                  <div>
                    <h4 className="font-medium text-gray-700">Created</h4>
                    <p>{new Date(robots_data.created_at).toLocaleString()}</p>
                  </div>
                  
                  {/* Request Information Collapsible Panel */}
                  <div className="border rounded-md p-3 bg-gray-50">
                    <button 
                      className="w-full text-left flex justify-between items-center"
                      onClick={() => setShowRequestInfo(!showRequestInfo)}
                    >
                      <h4 className="font-medium text-gray-700">Request Information</h4>
                      <span>{showRequestInfo ? "▼" : "►"}</span>
                    </button>
                    
                    {showRequestInfo && (
                      <div className="mt-2 p-2 bg-white rounded border text-sm">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <span className="font-medium">Status Code:</span>
                            <span className="ml-2">{robots_data.request_info.status_code}</span>
                          </div>
                          <div>
                            <span className="font-medium">Encoding:</span>
                            <span className="ml-2">{robots_data.request_info.encoding}</span>
                          </div>
                        </div>
                        <div className="mt-2">
                          <span className="font-medium">Final URL:</span>
                          <span className="ml-2 text-blue-600 hover:underline">
                            <a href={robots_data.request_info.final_url} target="_blank" rel="noopener noreferrer">
                              {robots_data.request_info.final_url}
                            </a>
                          </span>
                        </div>
                        
                        <div className="mt-2">
                          <details className="text-xs">
                            <summary className="cursor-pointer text-blue-600">View Headers</summary>
                            <pre className="mt-2 p-2 bg-gray-50 rounded overflow-auto max-h-40 text-xs">
                              {JSON.stringify(robots_data.request_info.headers, null, 2)}
                            </pre>
                          </details>
                        </div>
                        
                        {Object.keys(robots_data.cookies || {}).length > 0 && (
                          <div className="mt-2">
                            <details className="text-xs">
                              <summary className="cursor-pointer text-blue-600">View Cookies</summary>
                              <pre className="mt-2 p-2 bg-gray-50 rounded overflow-auto max-h-40 text-xs">
                                {JSON.stringify(robots_data.cookies, null, 2)}
                              </pre>
                            </details>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
              
              {/* Robots.txt Rules Card */}
              <Card>
                <h3 className="text-lg font-semibold mb-4">Robots.txt Rules</h3>
                <div className="max-h-[300px] overflow-y-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="p-2">Path</th>
                        <th className="p-2">Permission</th>
                      </tr>
                    </thead>
                    <tbody>
                      {robots_data.rules.map((rule, idx) => (
                        <tr key={idx} className="border-b hover:bg-gray-50">
                          <td className="p-2 font-mono">{rule.path}</td>
                          <td className={`p-2 ${rule.permission ? 'text-green-600' : 'text-red-600'}`}>
                            {rule.permission ? 'Allow' : 'Disallow'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
              
              {/* Declared Sitemaps Card */}
              <Card>
                <h3 className="text-lg font-semibold mb-4">Declared Sitemaps</h3>
                <div className="max-h-[200px] overflow-y-auto">
                  {robots_data.sitemaps.length > 0 ? (
                    <ul className="list-disc pl-5">
                      {robots_data.sitemaps.map((sitemap, idx) => (
                        <li key={idx} className="mb-1">
                          <a 
                            href={sitemap} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="text-blue-600 hover:underline"
                          >
                            {sitemap}
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-gray-500 italic">No sitemaps declared in robots.txt</p>
                  )}
                </div>
              </Card>
            </div>
          ) : (
            <Alert color="info">
              <p>No robots.txt data available for this website.</p>
            </Alert>
          )}
        </TabItem>

        {/* Pages List Tab */}
        <TabItem 
          title="Pages" 
          icon={HiDocumentText}
          active={activeTab === 'pages'}
        >
          {/* Sitemap Information */}
          <Card className="mb-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Sitemap Analysis</h3>
              <Button 
                color="light" 
                size="xs"
                onClick={() => setShowFullSitemapInfo(!showFullSitemapInfo)}
              >
                {showFullSitemapInfo ? "Show Less" : "Show Details"}
              </Button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className="border rounded-md p-3 bg-blue-50 text-center">
                <div className="text-2xl font-bold text-blue-700">{site_data.sitemap_pages?.length || 0}</div>
                <div className="text-sm text-gray-600">Total Pages</div>
              </div>
              
              <div className="border rounded-md p-3 bg-green-50 text-center">
                <div className="text-2xl font-bold text-green-700">{site_data.scraped_pages?.length || 0}</div>
                <div className="text-sm text-gray-600">Scraped Pages</div>
              </div>
              
              <div className="border rounded-md p-3 bg-yellow-50 text-center">
                <div className="text-2xl font-bold text-yellow-700">
                  {site_data.sitemap_pages?.length 
                    ? Math.round((site_data.scraped_pages?.length || 0) / site_data.sitemap_pages.length * 100) 
                    : 0}%
                </div>
                <div className="text-sm text-gray-600">Coverage</div>
              </div>
            </div>
            
            {showFullSitemapInfo && (
              <div className="border-t pt-4 mt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-medium text-gray-700 mb-2">Most Common URL Patterns</h4>
                    <div className="bg-gray-50 rounded p-2 text-sm">
                      <ul className="list-disc pl-5">
                        {/* This is a simplified example; in production you'd analyze patterns */}
                        {site_data.sitemap_pages?.slice(0, 3).map((page, i) => {
                          const url = new URL(page);
                          return (
                            <li key={i} className="mb-1 truncate">
                              {url.pathname.split('/').slice(0, 2).join('/')}/*
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="font-medium text-gray-700 mb-2">URL Extensions</h4>
                    <div className="bg-gray-50 rounded p-2 text-sm">
                      {/* This would be calculated in production */}
                      <div className="flex items-center justify-between mb-1">
                        <span>.html</span>
                        <span className="bg-blue-100 rounded px-2 py-0.5 text-xs">
                          {site_data.sitemap_pages?.filter(p => p.endsWith('.html')).length || 0} pages
                        </span>
                      </div>
                      <div className="flex items-center justify-between mb-1">
                        <span>.php</span>
                        <span className="bg-blue-100 rounded px-2 py-0.5 text-xs">
                          {site_data.sitemap_pages?.filter(p => p.endsWith('.php')).length || 0} pages
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>No extension</span>
                        <span className="bg-blue-100 rounded px-2 py-0.5 text-xs">
                          {site_data.sitemap_pages?.filter(p => !p.split('?')[0].includes('.')).length || 0} pages
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </Card>
          
          {/* Pages List */}
          <h3 className="text-lg font-semibold mb-4">All Pages ({site_data.sitemap_pages?.length || 0})</h3>
          <Card className="overflow-hidden">
            <div className="max-h-[500px] overflow-y-auto">
              {site_data.sitemap_pages && site_data.sitemap_pages.length > 0 ? (
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">#</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Page URL</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {site_data.sitemap_pages.map((page, index) => (
                      <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">{index + 1}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <a 
                            href={page} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline flex items-center gap-1 max-w-md truncate"
                          >
                            <span className="truncate">{page}</span>
                            <HiLink className="flex-shrink-0" />
                          </a>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {site_data.scraped_pages && site_data.scraped_pages.includes(page) ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              <HiCheck className="mr-1" /> Scraped
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                              Not Scraped
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="p-4 text-gray-500 italic">No pages found</p>
              )}
            </div>
          </Card>
        </TabItem>

        {/* Scraped Content Tab */}
        <TabItem 
          title="Content" 
          icon={HiTable}
          active={activeTab === 'content'}
        >
          {scraped_content && scraped_content.length > 0 ? (
            <div className="space-y-6">
              {scraped_content.map((content, idx) => (
                <Card key={idx} className="overflow-hidden">
                  <h3 className="text-lg font-semibold mb-2 flex items-center justify-between">
                    <a 
                      href={content.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline flex items-center gap-1"
                    >
                      <span className="truncate max-w-md">{content.url}</span>
                      <HiLink />
                    </a>
                    <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                      Page ID: {content._id.substring(0, 8)}...
                    </span>
                  </h3>

                  <Accordion>
                    {/* Text Content */}
                    <AccordionPanel>
                      <AccordionTitle className="flex items-center">
                        <HiDocumentDuplicate className="mr-2 h-5 w-5" />
                        Text Content ({content.content.text_content?.length || 0} items)
                      </AccordionTitle>
                      <AccordionContent>
                        {content.content.text_content?.length > 0 ? (
                          <div className="space-y-2 max-h-[300px] overflow-y-auto">
                            {content.content.text_content.map((text, textIdx) => (
                              <div key={textIdx} className="p-2 bg-gray-50 rounded">
                                <p>{text.content}</p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="italic text-gray-500">No text content found</p>
                        )}
                      </AccordionContent>
                    </AccordionPanel>
                    
                    {/* <AccordionPanel>
                      <AccordionTitle className="flex items-center">
                        <HiPhotograph className="mr-2 h-5 w-5" />
                        Images ({content.content.images?.length || 0} items)
                      </AccordionTitle>
                      <AccordionContent>
                        {content.content.images?.length > 0 ? (
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[400px] overflow-y-auto">
                            {content.content.images.map((img, imgIdx) => (
                              <div key={imgIdx} className="border rounded-md p-2">
                                <div className="relative h-32 bg-gray-100 rounded flex items-center justify-center overflow-hidden mb-2">
                                  <img 
                                    src={img.url} 
                                    alt={img.alt_text || "Image"} 
                                    className="max-h-32 max-w-full object-contain"
                                    onError={(e) => {
                                      e.currentTarget.src = "https://via.placeholder.com/150?text=Error+Loading";
                                    }}
                                  />
                                </div>
                                <p className="text-xs truncate">{img.url}</p>
                                {img.alt_text && (
                                  <p className="text-xs text-gray-500">Alt: {img.alt_text}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="italic text-gray-500">No images found</p>
                        )}
                      </AccordionContent>
                    </AccordionPanel>

                    <AccordionPanel>
                      <Accordion.Title className="flex items-center">
                        <HiTemplate className="mr-2 h-5 w-5" />
                        Image Text Extraction ({content.content.image_texts?.length || 0} items)
                      </Accordion.Title>
                      <AccordionContent>
                        {content.content.image_texts?.length > 0 ? (
                          <div className="space-y-4 max-h-[400px] overflow-y-auto">
                            {content.content.image_texts.map((imgText, textIdx) => (
                              <div key={textIdx} className="border rounded-md p-3">
                                <div className="flex items-start gap-4">
                                  <div className="w-20 h-20 bg-gray-100 flex-shrink-0 rounded flex items-center justify-center overflow-hidden">
                                    <img 
                                      src={imgText.image_url} 
                                      alt="Image with text" 
                                      className="max-h-20 max-w-full object-contain"
                                      onError={(e) => {
                                        e.currentTarget.src = "https://via.placeholder.com/80?text=Error";
                                      }}
                                    />
                                  </div>
                                  <div className="flex-1">
                                    <h4 className="font-medium mb-1">Extracted Text</h4>
                                    {imgText.error ? (
                                      <p className="text-red-500 text-sm">{imgText.error}</p>
                                    ) : (
                                      <p className="text-sm bg-gray-50 p-2 rounded">{imgText.extracted_text || "No text extracted"}</p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="italic text-gray-500">No image text extractions available</p>
                        )}
                      </AccordionContent>
                    </AccordionPanel>

                    {content.content.orders && content.content.orders.length > 0 && (
                      <AccordionPanel>
                        <Accordion.Title className="flex items-center">
                          <HiChartPie className="mr-2 h-5 w-5" />
                          Orders ({content.content.orders.length} items)
                        </Accordion.Title>
                        <AccordionContent>
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="p-2">Order ID</th>
                                  <th className="p-2">Product</th>
                                  <th className="p-2">Quantity</th>
                                  <th className="p-2">Price</th>
                                </tr>
                              </thead>
                              <tbody>
                                {content.content.orders.map((order, orderIdx) => (
                                  <tr key={orderIdx} className="border-b hover:bg-gray-50">
                                    <td className="p-2">{order.order_id}</td>
                                    <td className="p-2">{order.product_name}</td>
                                    <td className="p-2">{order.quantity}</td>
                                    <td className="p-2">{order.price}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </AccordionContent>
                      </AccordionPanel>
                    )} */}
                  </Accordion>
                </Card>
              ))}
            </div>
          ) : (
            <Alert color="info">
              <p>No page content has been scraped for this project.</p>
            </Alert>
          )}
        </TabItem>
        
        {/* Data Flow Tab */}
        <TabItem 
          title="Data Flow" 
          icon={HiChartPie}
          active={activeTab === 'data-flow'}
        >
          <Card>
            <h3 className="text-lg font-bold mb-6">Full Data Information Flow</h3>

            <div className="space-y-8">
              {/* Step 1: Initial URL */}
              <div className="flex items-start">
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center mr-4 flex-shrink-0">
                  <span className="font-bold text-blue-700">1</span>
                </div>
                <div>
                  <h4 className="font-bold text-gray-800 mb-1">Project Initialization</h4>
                  <p className="text-gray-600 mb-2">Project created with base URL: <span className="font-mono bg-gray-100 px-1">{url}</span></p>
                  
                  <div className="bg-blue-50 border border-blue-200 rounded-md p-3 text-sm mt-2">
                    <p className="font-medium text-blue-700 mb-1">Database Storage:</p>
                    <ul className="list-disc pl-5 text-gray-700">
                      <li>Project document created in <code>projects</code> collection</li>
                      <li>Project ID: <code>{project._id}</code></li>
                      <li>Associated with user: <code>{project.user_email}</code></li>
                    </ul>
                  </div>
                </div>
              </div>
              
              {/* Step 2: Robots.txt */}
              <div className="flex items-start">
                <div className={`w-8 h-8 rounded-full ${robots_data ? 'bg-green-100' : 'bg-red-100'} flex items-center justify-center mr-4 flex-shrink-0`}>
                  <span className={`font-bold ${robots_data ? 'text-green-700' : 'text-red-700'}`}>2</span>
                </div>
                <div className="flex-1">
                  <h4 className="font-bold text-gray-800 mb-1">Robots.txt Processing</h4>
                  
                  {robots_data ? (
                    <>
                      <p className="text-gray-600">Successfully fetched and processed robots.txt</p>
                      
                      <div className="bg-green-50 border border-green-200 rounded-md p-3 text-sm mt-2">
                        <p className="font-medium text-green-700 mb-1">Data Collected:</p>
                        <ul className="list-disc pl-5 text-gray-700">
                          <li><strong>{robots_data.rules.length}</strong> crawling rules</li>
                          <li><strong>{robots_data.sitemaps.length}</strong> sitemap declarations</li>
                          <li>Document stored in <code>robots</code> collection with ID <code>{robots_data._id}</code></li>
                          <li>Referenced in project via <code>site_data.robots_id</code></li>
                        </ul>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-gray-600">Could not process robots.txt</p>
                      
                      <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm mt-2">
                        <p className="font-medium text-red-700 mb-1">Processing Status:</p>
                        <ul className="list-disc pl-5 text-gray-700">
                          <li>Status: <code>{processing_status.robots_status}</code></li>
                          {processing_status.errors
                            .filter(err => err.includes('robots'))
                            .map((err, i) => (
                              <li key={i}>{err}</li>
                            ))
                          }
                        </ul>
                      </div>
                    </>
                  )}
                </div>
              </div>
              
              {/* Step 3: Sitemap */}
              <div className="flex items-start">
                <div className={`w-8 h-8 rounded-full ${site_data.sitemap_pages.length > 1 ? 'bg-green-100' : 'bg-yellow-100'} flex items-center justify-center mr-4 flex-shrink-0`}>
                  <span className={`font-bold ${site_data.sitemap_pages.length > 1 ? 'text-green-700' : 'text-yellow-700'}`}>3</span>
                </div>
                <div className="flex-1">
                  <h4 className="font-bold text-gray-800 mb-1">Sitemap Processing</h4>
                  
                  {site_data.sitemap_pages.length > 1 ? (
                    <>
                      <p className="text-gray-600">Successfully found and processed sitemap</p>
                      
                      <div className="bg-green-50 border border-green-200 rounded-md p-3 text-sm mt-2">
                        <p className="font-medium text-green-700 mb-1">Data Collected:</p>
                        <ul className="list-disc pl-5 text-gray-700">
                          <li><strong>{site_data.sitemap_pages.length}</strong> pages discovered</li>
                          <li>Pages stored in <code>project.site_data.sitemap_pages</code> array</li>
                          <li>Individual page information stored in <code>pages</code> collection</li>
                        </ul>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-gray-600">Limited sitemap information found</p>
                      
                      <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 text-sm mt-2">
                        <p className="font-medium text-yellow-700 mb-1">Processing Status:</p>
                        <ul className="list-disc pl-5 text-gray-700">
                          <li>Status: <code>{processing_status.sitemap_status}</code></li>
                          <li>Found only {site_data.sitemap_pages.length} page(s)</li>
                          {processing_status.errors
                            .filter(err => err.includes('sitemap'))
                            .map((err, i) => (
                              <li key={i}>{err}</li>
                            ))
                          }
                        </ul>
                      </div>
                    </>
                  )}
                </div>
              </div>
              
              {/* Step 4: Content Scraping */}
              <div className="flex items-start">
                <div className={`w-8 h-8 rounded-full ${scraped_content.length > 0 ? 'bg-green-100' : 'bg-red-100'} flex items-center justify-center mr-4 flex-shrink-0`}>
                  <span className={`font-bold ${scraped_content.length > 0 ? 'text-green-700' : 'text-red-700'}`}>4</span>
                </div>
                <div className="flex-1">
                  <h4 className="font-bold text-gray-800 mb-1">Content Scraping</h4>
                  
                  {scraped_content.length > 0 ? (
                    <>
                      <p className="text-gray-600">Successfully scraped {scraped_content.length} pages</p>
                      
                      <div className="bg-green-50 border border-green-200 rounded-md p-3 text-sm mt-2">
                        <p className="font-medium text-green-700 mb-1">Data Chain:</p>
                        <ul className="list-disc pl-5 text-gray-700">
                          <li>Scraped URLs stored in <code>site_data.scraped_pages</code> array</li>
                          <li>Content documents stored in <code>sites</code> collection</li>
                          <li>Each document includes text, images, extracted image text, and specialized content</li>
                          <li>Referenced by URL in project's <code>scraped_pages</code> array</li>
                        </ul>
                      </div>
                      
                      <div className="mt-3">
                        <h5 className="font-medium text-gray-700 mb-1">Content Breakdown:</h5>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          <div className="bg-blue-50 p-2 rounded border border-blue-100 text-center">
                            <div className="text-lg font-bold text-blue-700">
                              {scraped_content.reduce((sum, page) => 
                                sum + (page.content.text_content?.length || 0), 0)}
                            </div>
                            <div className="text-xs text-gray-600">Text Elements</div>
                          </div>
                          <div className="bg-purple-50 p-2 rounded border border-purple-100 text-center">
                            <div className="text-lg font-bold text-purple-700">
                              {scraped_content.reduce((sum, page) => 
                                sum + (page.content.images?.length || 0), 0)}
                            </div>
                            <div className="text-xs text-gray-600">Images</div>
                          </div>
                          <div className="bg-pink-50 p-2 rounded border border-pink-100 text-center">
                            <div className="text-lg font-bold text-pink-700">
                              {scraped_content.reduce((sum, page) => 
                                sum + (page.content.image_texts?.length || 0), 0)}
                            </div>
                            <div className="text-xs text-gray-600">Image Extractions</div>
                          </div>
                          <div className="bg-indigo-50 p-2 rounded border border-indigo-100 text-center">
                            <div className="text-lg font-bold text-indigo-700">
                              {scraped_content.reduce((sum, page) => 
                                sum + (page.content.orders?.length || 0), 0)}
                            </div>
                            <div className="text-xs text-gray-600">Orders</div>
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-gray-600">No content was successfully scraped</p>
                      
                      <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm mt-2">
                        <p className="font-medium text-red-700 mb-1">Processing Issues:</p>
                        <ul className="list-disc pl-5 text-gray-700">
                          {processing_status.errors
                            .filter(err => err.includes('scrap') || err.includes('page'))
                            .map((err, i) => (
                              <li key={i}>{err}</li>
                            ))
                          }
                          {processing_status.errors.length === 0 && (
                            <li>No specific errors recorded, but content scraping failed</li>
                          )}
                        </ul>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </Card>
        </TabItem>
      </Tabs>
    </div>
  );
}
