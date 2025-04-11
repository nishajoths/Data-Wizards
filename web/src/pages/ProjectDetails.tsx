import { useEffect, useState, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Card, Spinner, Button, Alert, Tabs, TabItem } from "flowbite-react";
import Cookies from 'js-cookie';
import { 
  HiArrowLeft, HiLink, HiGlobe, HiExclamationCircle, 
  HiCode, HiDocumentText, HiTable, HiOutlineCog,
  HiChartPie, HiTrash, HiLightningBolt
} from 'react-icons/hi';
import DeleteConfirmationModal from "../components/DeleteConfirmationModal";
import NetworkAnalytics from '../components/NetworkAnalytics';

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
          const tabs = ['overview', 'robots', 'pages', 'content', 'data-flow', 'network'];
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
              {site_data.sitemap_pages?.length > 0 ? (
                <ul className="list-disc pl-5 text-gray-600">
                  {site_data.sitemap_pages.map((page, index) => (
                    <li key={index}>
                      <a href={page} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                        {page}
                      </a>
                    </li>
                  ))}
                </ul>
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
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {scraped_content.map((content, index) => (
                    <Card key={index}>
                      <h4 className="font-bold text-gray-700 truncate">{content.url}</h4>
                      <p className="text-sm text-gray-500">Text: {content.content.text_content?.length || 0} items</p>
                      <p className="text-sm text-gray-500">Images: {content.content.images?.length || 0} items</p>
                      <p className="text-sm text-gray-500">Image Texts: {content.content.image_texts?.length || 0} items</p>
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
          title="Data Flow" 
          icon={HiChartPie}
          active={activeTab === 'data-flow'}
        >
          {activeTab === 'data-flow' && (
            <div>
              <h3 className="text-lg font-semibold mb-4">Data Flow Visualization</h3>
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

