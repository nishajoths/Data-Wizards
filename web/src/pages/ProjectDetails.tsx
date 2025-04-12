import { useEffect, useState, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Card, Spinner, Button, Alert, Tabs, TabItem, Label, Badge } from "flowbite-react";
import Cookies from 'js-cookie';
import { 
  HiArrowLeft, HiLink, HiGlobe, HiExclamationCircle, 
  HiCode, HiDocumentText, HiTable, HiOutlineCog,
  HiChartPie, HiTrash, HiLightningBolt, HiPhotograph, 
  HiExternalLink, HiInformationCircle, HiRefresh
} from 'react-icons/hi';
import DeleteConfirmationModal from "../components/DeleteConfirmationModal";
import NetworkAnalytics from '../components/NetworkAnalytics';
import MetadataViewer from '../components/MetadataViewer';

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

// Interface for page metadata
interface PageMetadata {
  url: string;
  basic?: Record<string, string>;
  open_graph?: Record<string, string>;
  twitter?: Record<string, string>;
  structured_data?: any[];
  extracted_at?: string;
}

// Interface for structured content from scraped pages
interface ScrapedContent {
  _id: string;
  url: string;
  meta_info?: PageMetadata;
  content: {
    text_content: PageContent[];
    images: PageContent[];
    image_texts: PageContent[];
    orders: any[];
  };
  network_stats?: {
    total_time_ms: number;
    content_size_bytes: number;
  };
}

// Interface for processing status
interface ProcessingStatus {
  robots_status: string;
  sitemap_status: string;
  pages_found: number;
  pages_scraped: number;
  errors: string[];
  scrape_mode?: string;
  pages_limit?: number;
  network_stats?: {
    total_size_bytes: number;
    total_duration_ms: number;
    pages_with_metrics: number;
    avg_speed_kbps: number;
    fastest_page: { url: string | null; speed_kbps: number };
    slowest_page: { url: string | null; speed_kbps: number };
    total_requests: number;
  };
}

// Interface for extracted links
interface ExtractedLink {
  url: string;
  text: string;
  has_keyword: boolean;
  matching_keywords?: string[];
  source_page?: string;
}

interface ProjectLinks {
  project_id: string;
  links_count: number;
  links_with_keywords: number;
  links: ExtractedLink[];
}

interface VisitedLink extends ExtractedLink {
  scraped: boolean;
  scraped_at?: string;
  content_summary?: {
    text_elements: number;
    images: number;
    size_bytes: number;
    load_time_ms?: number;
    new_links_found?: number;
  };
  product_info?: {
    name?: string;
    description?: string;
    price?: string;
    currency?: string;
    brand?: string;
    image_url?: string;
    availability?: string;
  };
  error?: string;
}

interface ProjectVisitedLinks {
  project_id: string;
  links_count: number;
  links_scraped: number;
  links_with_keywords: number;
  links: VisitedLink[];
  network_stats?: {
    avg_load_time_ms?: number;
    avg_size_kb?: number;
    total_errors?: number;
    fastest_load_ms?: number;
  };
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
    robots_rules?: RobotsRule[];
    sitemap_urls?: string[];
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
  const [wsConnected, setWsConnected] = useState(false);
  const [isLiveUpdating, setIsLiveUpdating] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const navigate = useNavigate();
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [selectedPageMetadata, setSelectedPageMetadata] = useState<PageMetadata | null>(null);
  const [projectLinks, setProjectLinks] = useState<ProjectLinks | null>(null);
  const [linksLoading, setLinksLoading] = useState(false);
  const [projectVisitedLinks, setProjectVisitedLinks] = useState<ProjectVisitedLinks | null>(null);
  const [visitedLinksLoading, setVisitedLinksLoading] = useState(false);

  useEffect(() => {
    const fetchProject = async () => {
      try {
        if (!projectId || !token) {
          throw new Error("Missing project ID or authentication token");
        }
        
        setLoading(true);
        console.log(`Fetching complete project with ID: ${projectId}`);
        
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

  useEffect(() => {
    if (project && project.processing_status && 
      (project.processing_status.pages_scraped < project.processing_status.pages_found)) {
      const wsUrl = `ws://localhost:8000/ws/project_${project._id}`;
      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;

      socket.onopen = () => {
        setWsConnected(true);
        setIsLiveUpdating(true);
      };

      socket.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'completion') {
            fetchProject();
          }
        } catch (err) {
          console.error('Error parsing WebSocket message:', err);
        }
      };

      socket.onclose = () => {
        setWsConnected(false);
        setIsLiveUpdating(false);
      };

      return () => {
        if (socket && socket.readyState === WebSocket.OPEN) {
          socket.close();
        }
      };
    }
  }, [project]);

  const fetchProject = async () => {
    try {
      if (!projectId || !token) {
        throw new Error("Missing project ID or authentication token");
      }
      
      setLoading(true);
      console.log(`Fetching complete project with ID: ${projectId}`);
      
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
  
  const fetchProjectLinks = async () => {
    if (!projectId || !token) return;
    
    try {
      setLinksLoading(true);
      const response = await fetch(`http://localhost:8000/projects/${projectId}/links`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch project links: ${response.status}`);
      }
      
      const data = await response.json();
      setProjectLinks(data);
    } catch (err) {
      console.error("Error fetching project links:", err);
    } finally {
      setLinksLoading(false);
    }
  };
  
  const fetchProjectVisitedLinks = async () => {
    if (!projectId || !token) return;
    
    try {
      setVisitedLinksLoading(true);
      const response = await fetch(`http://localhost:8000/projects/${projectId}/visited_links`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch project visited links: ${response.status}`);
      }
      
      const data = await response.json();
      setProjectVisitedLinks(data);
    } catch (err) {
      console.error("Error fetching project visited links:", err);
    } finally {
      setVisitedLinksLoading(false);
    }
  };
  
  useEffect(() => {
    if (activeTab === 'links' && !projectLinks && !linksLoading) {
      fetchProjectLinks();
    }
  }, [activeTab, projectLinks, linksLoading]);

  useEffect(() => {
    if (activeTab === 'visited-links' && !projectVisitedLinks && !visitedLinksLoading) {
      fetchProjectVisitedLinks();
    }
  }, [activeTab, projectVisitedLinks, visitedLinksLoading]);

  const handleDeleteClick = () => {
    setDeleteModalOpen(true);
    setDeleteError(null);
  };

  const handleDeleteConfirm = async () => {
    if (!projectId || !token) return;

    try {
      setDeleteLoading(true);
      setDeleteError(null);

      const response = await fetch(`http://localhost:8000/projects/${projectId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: "Failed to parse error" }));
        throw new Error(errorData.detail || `Failed to delete project (${response.status})`);
      }

      navigate('/dashboard', { state: { message: "Project successfully deleted" } });
    } catch (err) {
      console.error('Error deleting project:', err);
      setDeleteError(err instanceof Error ? err.message : 'An error occurred while deleting');
      setDeleteModalOpen(false);
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleViewMetadata = (pageUrl: string) => {
    const page = project?.related_data.scraped_content.find(p => p.url === pageUrl);
    if (page && page.meta_info) {
      setSelectedPageMetadata(page.meta_info);
    } else {
      setSelectedPageMetadata(null);
    }
  };

  if (loading) {
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

      {isLiveUpdating && (
        <Alert color="info" className="mb-4">
          <div className="flex items-center">
            <Spinner size="sm" className="mr-2" />
            <p>
              This project is actively being processed. The page will update automatically as new data becomes available.
            </p>
          </div>
        </Alert>
      )}

      {deleteError && (
        <Alert color="failure" className="mb-4">
          <div className="flex items-center">
            <HiExclamationCircle className="mr-2 h-5 w-5" />
            <h3 className="font-medium">Error deleting project</h3>
          </div>
          <p className="mt-1">{deleteError}</p>
        </Alert>
      )}
      
      <div className="flex flex-wrap items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{title}</h1>
          <p className="text-gray-600">Created on {createdDate}</p>
        </div>
        <Button color="failure" onClick={handleDeleteClick}>
          <HiTrash className="mr-2 h-5 w-5" />
          Delete Project
        </Button>
      </div>
      
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
      
      <Card className="mb-6">
        <h3 className="text-lg font-bold mb-4">Data Chain Visualization</h3>
        <div className="relative overflow-auto p-4 bg-gray-50 rounded-lg">
          <div className="flex flex-col items-center">
            <div className="border-2 border-blue-500 rounded-lg p-3 bg-blue-50 w-64 text-center">
              <h4 className="font-bold text-blue-700">Project</h4>
              <p className="text-sm">ID: {project._id.substring(0, 8)}...</p>
            </div>
            
            <div className="h-8 w-px bg-gray-400 my-1"></div>
            
            <div className="flex justify-center items-start w-full gap-8">
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
      
      <Tabs 
        aria-label="Project tabs" 
        className="underline"
        onActiveTabChange={(tabIndex) => {
          const tabs = ['overview', 'robots', 'pages', 'content', 'images', 'data-flow', 'network', 'metadata', 'links', 'visited-links'];
          setActiveTab(tabs[tabIndex]);
        }}
      >
        <TabItem 
          title="Overview" 
          icon={HiOutlineCog}
          active={activeTab === 'overview'}
        >
          {activeTab === 'overview' && (
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
                <h3 className="text-lg font-semibold mb-2">Errors</h3>
                {processing_status.errors.length > 0 ? (
                  <ul className="list-disc pl-5 text-gray-600">
                    {processing_status.errors.map((error, index) => (
                      <li key={index}>{error}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-gray-500 italic">No errors encountered</p>
                )}
              </Card>

              <Card>
                <div className="p-4 border rounded-lg bg-white">
                  <div className="flex items-center">
                    <HiInformationCircle className="w-6 h-6 text-blue-500" />
                    <div className="ml-3">
                      <h3 className="font-medium">Scraping Mode</h3>
                      <p className="text-sm text-gray-500">
                        {processing_status.scrape_mode === 'all'
                          ? 'All pages were targeted for scraping'
                          : `Limited to ${processing_status.pages_limit || 5} pages`}
                      </p>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          )}
        </TabItem>

        <TabItem 
          title="Robots.txt" 
          icon={HiCode}
          active={activeTab === 'robots'}
        >
          {activeTab === 'robots' && (
            <div>
              <h3 className="text-lg font-semibold mb-4">Robots.txt Rules</h3>
              {(site_data.robots_rules ?? []).length > 0 ? (
                <ul className="list-disc pl-5 text-gray-600">
                  {(site_data.robots_rules ?? []).map((rule, index) => (
                    <li key={index}>
                      <span className="font-medium">{rule.permission ? 'Allow' : 'Disallow'}:</span> {rule.path}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-gray-500 italic">No rules found in robots.txt</p>
              )}

              <h3 className="text-lg font-semibold mt-6 mb-4">Sitemap URLs</h3>
              {(site_data.sitemap_urls ?? []).length > 0 ? (
                <ul className="list-disc pl-5 text-gray-600">
                  {(site_data.sitemap_urls ?? []).map((url, index) => (
                    <li key={index}>
                      <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                        {url}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-gray-500 italic">No sitemap URLs found</p>
              )}
            </div>
          )}
        </TabItem>

        <TabItem 
          title="Pages" 
          icon={HiDocumentText}
          active={activeTab === 'pages'}
        >
          {activeTab === 'pages' && (
            <div>
              <h3 className="text-lg font-semibold mb-4">Discovered Pages</h3>
              
              <div className="mb-4 flex justify-between items-center">
                <p className="text-sm text-gray-600">
                  {site_data.sitemap_pages?.length || 0} pages were found in the sitemap
                </p>
                
                {site_data.sitemap_pages?.length > 0 && (
                  <div className="flex gap-2">
                    <span className="inline-flex items-center px-2 py-1 text-xs rounded-md bg-green-100 text-green-800">
                      <span className="w-2 h-2 mr-1 rounded-full bg-green-500"></span>
                      {scraped_content.length} scraped
                    </span>
                    <span className="inline-flex items-center px-2 py-1 text-xs rounded-md bg-gray-100 text-gray-800">
                      <span className="w-2 h-2 mr-1 rounded-full bg-gray-500"></span>
                      {(site_data.sitemap_pages?.length || 0) - scraped_content.length} not scraped
                    </span>
                  </div>
                )}
              </div>
              
              {site_data.sitemap_pages?.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left text-gray-500">
                    <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                      <tr>
                        <th scope="col" className="px-4 py-3">URL</th>
                        <th scope="col" className="px-4 py-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {site_data.sitemap_pages.map((page, index) => {
                        // Check if this page was successfully scraped
                        const isScraped = scraped_content.some(content => content.url === page);
                        
                        return (
                          <tr key={index} className="bg-white border-b hover:bg-gray-50">
                            <td className="px-4 py-3">
                              <a 
                                href={page} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="text-blue-600 hover:underline flex items-center"
                              >
                                <span className="truncate max-w-md inline-block">{page}</span>
                                <HiExternalLink className="ml-1 flex-shrink-0" />
                              </a>
                            </td>
                            <td className="px-4 py-3 text-center">
                              {isScraped ? (
                                <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
                                  <span className="w-2 h-2 mr-1 rounded-full bg-green-500"></span>
                                  Scraped
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-800">
                                  <span className="w-2 h-2 mr-1 rounded-full bg-gray-500"></span>
                                  Not Scraped
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-gray-500 italic">No pages found in sitemap</p>
              )}
            </div>
          )}
        </TabItem>

        <TabItem 
          title="Content" 
          icon={HiTable}
          active={activeTab === 'content'}
        >
          {activeTab === 'content' && (
            <div>
              <h3 className="text-lg font-semibold mb-4">Scraped Content</h3>
              {scraped_content.length > 0 ? (
                <div className="space-y-8">
                  {scraped_content.map((content, index) => (
                    <Card key={index} className="overflow-hidden">
                      <div className="border-b pb-2 mb-4">
                        <h4 className="font-bold text-lg text-blue-700 truncate">
                          <a href={content.url} target="_blank" rel="noopener noreferrer" className="hover:underline flex items-center">
                            {content.url} <HiLink className="ml-1" size={16} />
                          </a>
                        </h4>
                        <div className="flex gap-2 text-xs text-gray-500 mt-1">
                          <span>{content.content.text_content?.length || 0} text items</span>
                          <span>•</span>
                          <span>{content.content.images?.length || 0} images</span>
                          <span>•</span>
                          <span>{content.content.image_texts?.length || 0} image texts</span>
                        </div>
                      </div>
                      
                      {/* Text Content Section */}
                      {content.content.text_content?.length > 0 && (
                        <div className="mb-4">
                          <h5 className="font-semibold text-gray-700 mb-2">Text Content</h5>
                          <div className="max-h-60 overflow-y-auto p-3 bg-gray-50 rounded">
                            {content.content.text_content.map((text, textIndex) => (
                              <div key={textIndex} className="mb-2 last:mb-0">
                                <p className="text-sm text-gray-700">{text.content}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {/* Images Section */}
                      {content.content.images?.length > 0 && (
                        <div className="mb-4">
                          <h5 className="font-semibold text-gray-700 mb-2">Images</h5>
                          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                            {content.content.images.map((image, imgIndex) => (
                              <div key={imgIndex} className="relative group">
                                <img 
                                  src={image.url} 
                                  alt={image.alt_text || "Scraped image"}
                                  className="w-full h-40 object-contain rounded border border-gray-200"
                                  onError={(e) => {
                                    const target = e.target as HTMLImageElement;
                                    target.src = "https://via.placeholder.com/150?text=Image+Error";
                                  }}
                                />
                                {image.alt_text && (
                                  <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-60 text-white text-xs p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {image.alt_text}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {/* Extracted Text from Images Section */}
                      {content.content.image_texts?.length > 0 && (
                        <div>
                          <h5 className="font-semibold text-gray-700 mb-2">Text Extracted from Images</h5>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {content.content.image_texts
                              .filter(img => img.extracted_text && img.extracted_text.trim() !== "")
                              .map((imgText, textIndex) => (
                                <div key={textIndex} className="flex bg-gray-50 rounded p-2">
                                  <img 
                                    src={imgText.image_url} 
                                    alt="Source image"
                                    className="w-16 h-16 object-cover rounded mr-2"
                                    onError={(e) => {
                                      const target = e.target as HTMLImageElement;
                                      target.src = "https://via.placeholder.com/60?text=Img";
                                    }}
                                  />
                                  <div className="flex-1">
                                    <p className="text-xs text-gray-700 overflow-auto max-h-16">
                                      {imgText.extracted_text}
                                    </p>
                                  </div>
                                </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </Card>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 italic">No content scraped</p>
              )}
            </div>
          )}
        </TabItem>

        <TabItem 
          title="Images" 
          icon={HiPhotograph}
          active={activeTab === 'images'}
        >
          {activeTab === 'images' && (
            <div>
              <h3 className="text-lg font-semibold mb-4">All Images</h3>
              {scraped_content.length > 0 && scraped_content.some(content => content.content.images?.length > 0) ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {scraped_content.flatMap((content) => 
                    content.content.images?.map((image, imgIndex) => (
                      <div key={`${content._id}-${imgIndex}`} className="group">
                        <div className="relative aspect-square bg-gray-100 rounded overflow-hidden">
                          <img 
                            src={image.url} 
                            alt={image.alt_text || "Scraped image"}
                            className="w-full h-full object-cover transition-transform group-hover:scale-105"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.src = "https://via.placeholder.com/150?text=Image+Error";
                            }}
                          />
                          <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all flex items-end justify-center">
                            <div className="p-2 translate-y-full group-hover:translate-y-0 transition-transform w-full bg-white bg-opacity-75">
                              <p className="text-xs truncate">{image.alt_text || "No description"}</p>
                              <a 
                                href={image.url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-xs text-blue-600 hover:underline flex items-center"
                              >
                                View original <HiExternalLink className="ml-1" size={12} />
                              </a>
                            </div>
                          </div>
                        </div>
                      </div>
                    )) || []
                  )}
                </div>
              ) : (
                <p className="text-gray-500 italic">No images found in the scraped content</p>
              )}
            </div>
          )}
        </TabItem>

        <TabItem 
          title="Data Flow" 
          icon={HiChartPie}
          active={activeTab === 'data-flow'}
        >
          {activeTab === 'data-flow' && (
            <div>
              <h3 className="text-lg font-semibold mb-4">Data Flow Visualization</h3>
              
              {/* Metrics Summary */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <Card>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-blue-600">{site_data.sitemap_pages?.length || 0}</div>
                    <div className="text-sm text-gray-500">Pages Discovered</div>
                  </div>
                </Card>
                <Card>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-green-600">{scraped_content.length}</div>
                    <div className="text-sm text-gray-500">Pages Scraped</div>
                  </div>
                </Card>
                <Card>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-purple-600">
                      {scraped_content.reduce((sum, page) => {
                        const textCount = page.content.text_content?.length || 0;
                        const imageCount = page.content.images?.length || 0;
                        return sum + textCount + imageCount;
                      }, 0)}
                    </div>
                    <div className="text-sm text-gray-500">Elements Extracted</div>
                  </div>
                </Card>
              </div>
              
              {/* Standard Flow Diagram */}
              <div className="flex flex-col items-center">
                <div className="border-2 border-blue-500 rounded-lg p-3 bg-blue-50 w-64 text-center">
                  <h4 className="font-bold text-blue-700">Project</h4>
                  <p className="text-sm">ID: {project._id.substring(0, 8)}...</p>
                </div>
                <div className="h-8 w-px bg-gray-400 my-1"></div>
                <div className="flex justify-center items-start w-full gap-8">
                  <div className="border-2 border-green-500 rounded-lg p-3 w-52 text-center bg-green-50">
                    <h4 className="font-bold text-gray-700">Robots.txt</h4>
                    <p className="text-xs">{site_data.robots_rules?.length || 0} rules</p>
                  </div>
                  <div className="border-2 border-yellow-500 rounded-lg p-3 w-52 text-center bg-yellow-50">
                    <h4 className="font-bold text-gray-700">Sitemap</h4>
                    <p className="text-xs">{site_data.sitemap_pages?.length || 0} pages</p>
                  </div>
                  <div className="border-2 border-purple-500 rounded-lg p-3 w-52 text-center bg-purple-50">
                    <h4 className="font-bold text-gray-700">Scraped Content</h4>
                    <p className="text-xs">{scraped_content.length} pages</p>
                  </div>
                </div>
                
                {/* Content breakdown */}
                {scraped_content.length > 0 && (
                  <div className="mt-6 w-full">
                    <h5 className="font-semibold text-center mb-4">Content Breakdown</h5>
                    <div className="flex justify-center gap-6">
                      <div className="text-center p-3 rounded-lg bg-blue-50 border border-blue-200">
                        <div className="text-2xl font-bold text-blue-600">
                          {scraped_content.reduce((sum, page) => sum + (page.content.text_content?.length || 0), 0)}
                        </div>
                        <div className="text-xs text-gray-600">Text Elements</div>
                      </div>
                      <div className="text-center p-3 rounded-lg bg-pink-50 border border-pink-200">
                        <div className="text-2xl font-bold text-pink-600">
                          {scraped_content.reduce((sum, page) => sum + (page.content.images?.length || 0), 0)}
                        </div>
                        <div className="text-xs text-gray-600">Images</div>
                      </div>
                      <div className="text-center p-3 rounded-lg bg-purple-50 border border-purple-200">
                        <div className="text-2xl font-bold text-purple-600">
                          {scraped_content.reduce((sum, page) => sum + (page.content.image_texts?.length || 0), 0)}
                        </div>
                        <div className="text-xs text-gray-600">Image Texts</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </TabItem>

        <TabItem 
          title="Network" 
          icon={HiLightningBolt}
          active={activeTab === 'network'}
        >
          {activeTab === 'network' && (
            <NetworkAnalytics 
              networkStats={processing_status.network_stats} 
            />
          )}
        </TabItem>

        <TabItem 
          title="Metadata" 
          icon={HiInformationCircle}
          active={activeTab === 'metadata'}
        >
          {activeTab === 'metadata' && (
            <div className="space-y-6">
              <Card>
                <h3 className="text-xl font-bold mb-4">Page Metadata</h3>
                <p className="mb-4">View metadata extracted from each page including title, description, Open Graph tags, and more.</p>
                
                <div className="mb-4">
                  <Label htmlFor="page-selector">Select a page</Label>
                  <select
                    id="page-selector"
                    className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
                    onChange={(e) => handleViewMetadata(e.target.value)}
                    value={selectedPageMetadata?.url || ''}
                  >
                    <option value="">Select a page...</option>
                    {scraped_content.map((page) => (
                      <option key={page._id} value={page.url}>
                        {page.url}
                      </option>
                    ))}
                  </select>
                </div>
                
                {selectedPageMetadata ? (
                  <MetadataViewer metadata={selectedPageMetadata} url={selectedPageMetadata.url} />
                ) : (
                  <div className="text-center p-6 bg-gray-50 rounded-lg">
                    <p className="text-gray-500">Select a page to view its metadata</p>
                  </div>
                )}
              </Card>
              
              <Card>
                <h3 className="text-xl font-bold mb-4">Metadata Overview</h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-blue-50 p-4 rounded-lg">
                      <h4 className="font-medium text-blue-700 mb-2">Pages with Metadata</h4>
                      <p className="text-2xl font-bold">
                        {scraped_content.filter(page => page.meta_info).length} / {scraped_content.length}
                      </p>
                    </div>
                    
                    <div className="bg-green-50 p-4 rounded-lg">
                      <h4 className="font-medium text-green-700 mb-2">Open Graph Tags</h4>
                      <p className="text-2xl font-bold">
                        {scraped_content.filter(page => page.meta_info?.open_graph && Object.keys(page.meta_info.open_graph).length > 0).length}
                      </p>
                    </div>
                  </div>
                  
                  <table className="w-full text-sm text-left text-gray-500">
                    <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                      <tr>
                        <th scope="col" className="py-2 px-4">URL</th>
                        <th scope="col" className="py-2 px-4">Title</th>
                        <th scope="col" className="py-2 px-4">Has Meta</th>
                        <th scope="col" className="py-2 px-4">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scraped_content.slice(0, 10).map((page) => (
                        <tr key={page._id} className="bg-white border-b">
                          <td className="py-2 px-4 truncate max-w-xs">{page.url}</td>
                          <td className="py-2 px-4 truncate max-w-xs">{page.meta_info?.basic?.title || "No title"}</td>
                          <td className="py-2 px-4">
                            {page.meta_info ? (
                              <Badge color="success">Yes</Badge>
                            ) : (
                              <Badge color="failure">No</Badge>
                            )}
                          </td>
                          <td className="py-2 px-4">
                            <Button size="xs" color="light" onClick={() => handleViewMetadata(page.url)}>
                              View
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  
                  {scraped_content.length > 10 && (
                    <div className="text-center text-sm text-gray-500">
                      Showing 10 of {scraped_content.length} pages
                    </div>
                  )}
                </div>
              </Card>
            </div>
          )}
        </TabItem>

        <TabItem 
          title="Links" 
          icon={HiLink}
          active={activeTab === 'links'}
        >
          {activeTab === 'links' && (
            <div className="space-y-6">
              <Card>
                <h3 className="text-xl font-bold mb-4">Extracted Links</h3>
                {linksLoading ? (
                  <div className="flex justify-center py-8">
                    <Spinner size="xl" />
                  </div>
                ) : !projectLinks ? (
                  <div className="text-center py-6">
                    <p className="text-gray-500">No link data available</p>
                    <Button color="blue" className="mt-4" onClick={fetchProjectLinks}>
                      <HiRefresh className="mr-2" />
                      Fetch Links Data
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                      <Card>
                        <div className="text-center">
                          <div className="text-3xl font-bold text-blue-600">{projectLinks.links_count}</div>
                          <div className="text-sm text-gray-500">Total Links</div>
                        </div>
                      </Card>
                      <Card>
                        <div className="text-center">
                          <div className="text-3xl font-bold text-green-600">{projectLinks.links_with_keywords}</div>
                          <div className="text-sm text-gray-500">Links with Keywords</div>
                        </div>
                      </Card>
                      <Card>
                        <div className="text-center">
                          <div className="text-3xl font-bold text-purple-600">
                            {Math.round((projectLinks.links_with_keywords / (projectLinks.links_count || 1)) * 100)}%
                          </div>
                          <div className="text-sm text-gray-500">Keyword Match Rate</div>
                        </div>
                      </Card>
                    </div>
                    
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left text-gray-500">
                        <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                          <tr>
                            <th scope="col" className="px-4 py-3">Link Text</th>
                            <th scope="col" className="px-4 py-3">URL</th>
                            <th scope="col" className="px-4 py-3">Keywords</th>
                            <th scope="col" className="px-4 py-3">Source</th>
                          </tr>
                        </thead>
                        <tbody>
                          {projectLinks.links.map((link, index) => (
                            <tr key={index} className={`bg-white border-b hover:bg-gray-50 ${link.has_keyword ? 'bg-green-50' : ''}`}>
                              <td className="px-4 py-3 font-medium">
                                {link.text || "[No text]"}
                              </td>
                              <td className="px-4 py-3">
                                <a 
                                  href={link.url} 
                                  target="_blank" 
                                  rel="noopener noreferrer" 
                                  className="text-blue-600 hover:underline flex items-center"
                                >
                                  <span className="truncate max-w-xs inline-block">{link.url}</span>
                                  <HiExternalLink className="ml-1 flex-shrink-0" />
                                </a>
                              </td>
                              <td className="px-4 py-3">
                                {link.has_keyword ? (
                                  <div className="flex flex-wrap gap-1">
                                    {link.matching_keywords?.map((kw, kwIndex) => (
                                      <span key={kwIndex} className="bg-green-100 text-green-800 text-xs font-medium px-2 py-0.5 rounded">
                                        {kw}
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-gray-400">None</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-xs">
                                {link.source_page ? (
                                  <a 
                                    href={link.source_page} 
                                    target="_blank" 
                                    rel="noopener noreferrer" 
                                    className="text-blue-600 hover:underline"
                                  >
                                    {new URL(link.source_page).pathname}
                                  </a>
                                ) : (
                                  <span className="text-gray-400">Unknown</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </Card>
            </div>
          )}
        </TabItem>

        <TabItem 
          title="Visited Links" 
          icon={HiExternalLink}
          active={activeTab === 'visited-links'}
        >
          {activeTab === 'visited-links' && (
            <div className="space-y-6">
              <Card>
                <h3 className="text-xl font-bold mb-4">Visited Links & Their Content</h3>
                {visitedLinksLoading ? (
                  <div className="flex justify-center py-8">
                    <Spinner size="xl" />
                  </div>
                ) : !projectVisitedLinks ? (
                  <div className="text-center py-6">
                    <p className="text-gray-500">No visited link data available</p>
                    <Button color="blue" className="mt-4" onClick={fetchProjectVisitedLinks}>
                      <HiRefresh className="mr-2" />
                      Fetch Visited Links Data
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                      <Card>
                        <div className="text-center">
                          <div className="text-3xl font-bold text-blue-600">{projectVisitedLinks.links_count}</div>
                          <div className="text-sm text-gray-500">Total Links Processed</div>
                        </div>
                      </Card>
                      <Card>
                        <div className="text-center">
                          <div className="text-3xl font-bold text-green-600">{projectVisitedLinks.links_scraped}</div>
                          <div className="text-sm text-gray-500">Links Successfully Scraped</div>
                        </div>
                      </Card>
                      <Card>
                        <div className="text-center">
                          <div className="text-3xl font-bold text-purple-600">
                            {projectVisitedLinks.links_with_keywords}
                          </div>
                          <div className="text-sm text-gray-500">Links with Keywords</div>
                        </div>
                      </Card>
                    </div>
                    
                    {/* Network Statistics Summary */}
                    <div className="mb-6">
                      <h3 className="text-lg font-semibold mb-3">Network Performance</h3>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        <Card>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-indigo-600">
                              {projectVisitedLinks.network_stats?.avg_load_time_ms ? 
                                `${Math.round(projectVisitedLinks.network_stats.avg_load_time_ms)} ms` : 'N/A'}
                            </div>
                            <div className="text-sm text-gray-500">Avg Load Time</div>
                          </div>
                        </Card>
                        <Card>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-yellow-600">
                              {projectVisitedLinks.network_stats?.avg_size_kb ? 
                                `${Math.round(projectVisitedLinks.network_stats.avg_size_kb)} KB` : 'N/A'}
                            </div>
                            <div className="text-sm text-gray-500">Avg Page Size</div>
                          </div>
                        </Card>
                        <Card>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-red-600">
                              {projectVisitedLinks.network_stats?.total_errors || 0}
                            </div>
                            <div className="text-sm text-gray-500">Network Errors</div>
                          </div>
                        </Card>
                        <Card>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-emerald-600">
                              {projectVisitedLinks.network_stats?.fastest_load_ms ? 
                                `${Math.round(projectVisitedLinks.network_stats.fastest_load_ms)} ms` : 'N/A'}
                            </div>
                            <div className="text-sm text-gray-500">Fastest Response</div>
                          </div>
                        </Card>
                      </div>
                    </div>
                    
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left text-gray-500">
                        <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                          <tr>
                            <th scope="col" className="px-4 py-3">Link Text</th>
                            <th scope="col" className="px-4 py-3">URL</th>
                            <th scope="col" className="px-4 py-3">Status</th>
                            <th scope="col" className="px-4 py-3">Content</th>
                            <th scope="col" className="px-4 py-3">Product Info</th>
                            <th scope="col" className="px-4 py-3">Network</th>
                            <th scope="col" className="px-4 py-3">Source</th>
                            <th scope="col" className="px-4 py-3">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {projectVisitedLinks.links.map((link, index) => (
                            <tr key={index} className={`bg-white border-b hover:bg-gray-50 ${link.has_keyword ? 'bg-green-50' : ''}`}>
                              <td className="px-4 py-3 font-medium">
                                {link.text || "[No text]"}
                              </td>
                              <td className="px-4 py-3">
                                <a 
                                  href={link.url} 
                                  target="_blank" 
                                  rel="noopener noreferrer" 
                                  className="text-blue-600 hover:underline flex items-center"
                                >
                                  <span className="truncate max-w-xs inline-block">{link.url}</span>
                                  <HiExternalLink className="ml-1 flex-shrink-0" />
                                </a>
                              </td>
                              <td className="px-4 py-3">
                                {link.scraped ? (
                                  <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
                                    <span className="w-2 h-2 mr-1 rounded-full bg-green-500"></span>
                                    Scraped
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800">
                                    <span className="w-2 h-2 mr-1 rounded-full bg-red-500"></span>
                                    Failed
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                {link.content_summary ? (
                                  <div className="text-xs space-y-1">
                                    <div>
                                      {link.content_summary.text_elements} texts, {link.content_summary.images} images
                                    </div>
                                    {link.content_summary.new_links_found && (
                                      <div>
                                        <Badge color="indigo">{link.content_summary.new_links_found} new links found</Badge>
                                      </div>
                                    )}
                                  </div>
                                ) : link.error ? (
                                  <span className="text-xs text-red-600">{link.error}</span>
                                ) : (
                                  <span className="text-gray-400">No data</span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                {link.product_info && Object.keys(link.product_info).length > 0 ? (
                                  <div className="text-xs space-y-1">
                                    {link.product_info.name && (
                                      <div className="font-medium">{link.product_info.name}</div>
                                    )}
                                    {link.product_info.price && (
                                      <div className="font-bold text-green-700">
                                        {link.product_info.price} {link.product_info.currency}
                                      </div>
                                    )}
                                    {link.product_info.brand && (
                                      <div>Brand: {link.product_info.brand}</div>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-gray-400">No product data</span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                {link.content_summary ? (
                                  <div className="text-xs space-y-1">
                                    <div>{Math.round(link.content_summary.size_bytes/1024)} KB</div>
                                    {link.content_summary.load_time_ms !== undefined && (
                                      <div>
                                        {link.content_summary.load_time_ms} ms
                                        {link.content_summary.load_time_ms > 1000 ? (
                                          <Badge color="red" className="ml-1">Slow</Badge>
                                        ) : link.content_summary.load_time_ms < 300 ? (
                                          <Badge color="green" className="ml-1">Fast</Badge>
                                        ) : (
                                          <Badge color="yellow" className="ml-1">Medium</Badge>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-gray-400">N/A</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-xs">
                                {link.source_page ? (
                                  <a 
                                    href={link.source_page} 
                                    target="_blank" 
                                    rel="noopener noreferrer" 
                                    className="text-blue-600 hover:underline"
                                  >
                                    {new URL(link.source_page).pathname}
                                  </a>
                                ) : (
                                  <span className="text-gray-400">Unknown</span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <Button size="xs" color="light">
                                  Details
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </Card>
            </div>
          )}
        </TabItem>
      </Tabs>

      <DeleteConfirmationModal 
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={handleDeleteConfirm}
        isLoading={deleteLoading}
        title="Delete Project"
        message="Are you sure you want to delete this project and all its associated data? This action cannot be undone."
      />
    </div>
  );
}

