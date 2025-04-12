import { useEffect, useState } from "react";
import { Button, Card, Spinner, Alert, Badge, Table, Tabs, TableHead, TableHeadCell, TabItem, TableRow, TableBody, TableCell } from "flowbite-react";
import { Link, useParams } from "react-router-dom";
import Cookies from 'js-cookie';
import { 
  HiArrowLeft, 
  HiDownload, 
  HiInformationCircle,
  HiCode,
  HiTable,
  HiPhotograph,
  HiLink,
  HiExternalLink
} from 'react-icons/hi';

interface ExtractedDataItem {
  title?: string;
  text: string;
  html: string;
  links: string[];
  images: string[];
  structured_data?: Record<string, any>;
  _id?: string;
  timestamp?: string;
  page_number?: number;
  url?: string;
}

interface ExtensionProject {
  _id: string;
  project_id: string;
  user_id: string;
  user_email: string;
  url: string;
  name: string;
  description?: string;
  card_selector: string;
  pagination_selector?: string | null;
  created_at: string;
  updated_at?: string;
  status: string;
  cards_extracted: number;
  pages_scraped: number;
  extracted_data: ExtractedDataItem[];
}

export default function ExtensionProjectDetail() {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<ExtensionProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const token = Cookies.get('token');
  
  useEffect(() => {
    const fetchProject = async () => {
      if (!projectId || !token) {
        setError("Missing project ID or authentication token");
        setLoading(false);
        return;
      }
      
      try {
        setLoading(true);
        const response = await fetch(`http://localhost:8000/api/extension-projects/${projectId}`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        
        if (!response.ok) {
          throw new Error(`Failed to fetch project: ${response.status}`);
        }
        
        const data = await response.json();
        setProject(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An unknown error occurred");
      } finally {
        setLoading(false);
      }
    };
    
    fetchProject();
  }, [projectId, token]);
  
  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString();
  };

  const downloadProjectData = () => {
    if (!project) return;
    
    try {
      const dataStr = JSON.stringify(project.extracted_data, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.download = `${project.name.replace(/\s+/g, '_')}_data.json`;
      a.href = url;
      a.click();
      
      // Clean up
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Error downloading data:", err);
      alert("Failed to download project data");
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
            <Link to="/extension-projects">
              <Button color="light">Return to Project List</Button>
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
            <Link to="/extension-projects">
              <Button color="light">Return to Project List</Button>
            </Link>
          </div>
        </Alert>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto px-4 py-8">
      <Link to="/extension-projects" className="flex items-center text-blue-600 hover:underline mb-6">
        <HiArrowLeft className="mr-2" /> Back to Extension Projects
      </Link>
      
      <div className="flex flex-wrap items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{project.name}</h1>
          <p className="text-gray-600">Created on {formatDate(project.created_at)}</p>
        </div>
        <Button color="blue" onClick={downloadProjectData}>
          <HiDownload className="mr-2 h-5 w-5" />
          Download Data
        </Button>
      </div>
      
      <Card className="mb-6">
        <div className="flex items-center gap-3">
          <HiInformationCircle className="text-blue-600 w-8 h-8" />
          <div className="flex-1">
            <h2 className="text-xl font-bold">Website URL</h2>
            <a 
              href={project.url} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline flex items-center gap-1"
            >
              {project.url} <HiLink className="inline" />
            </a>
          </div>
        </div>
      </Card>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <Card>
          <h3 className="font-semibold text-lg mb-2">Project Stats</h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-600">Status:</span>
              <Badge color={project.status === 'completed' ? 'success' : project.status === 'failed' ? 'failure' : 'info'}>
                {project.status.replace('_', ' ')}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Cards Extracted:</span>
              <span className="font-medium">{project.cards_extracted}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Pages Scraped:</span>
              <span className="font-medium">{project.pages_scraped}</span>
            </div>
          </div>
        </Card>
        
        <Card>
          <h3 className="font-semibold text-lg mb-2">Card Selector</h3>
          <div className="p-3 bg-gray-50 rounded-lg overflow-auto">
            <code className="text-sm font-mono text-blue-700">{project.card_selector}</code>
          </div>
        </Card>
        
        <Card>
          <h3 className="font-semibold text-lg mb-2">Pagination Selector</h3>
          {project.pagination_selector ? (
            <div className="p-3 bg-gray-50 rounded-lg overflow-auto">
              <code className="text-sm font-mono text-purple-700">{project.pagination_selector}</code>
            </div>
          ) : (
            <p className="text-gray-500 italic">No pagination selector used</p>
          )}
        </Card>
      </div>
      
      <Tabs 
        aria-label="Project tabs" 
        className="underline"
        onActiveTabChange={(tabIndex) => {
          const tabs = ['overview', 'data', 'images', 'links'];
          setActiveTab(tabs[tabIndex]);
        }}
      >
        <TabItem title="Overview" icon={HiInformationCircle} active={activeTab === 'overview'}>
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <Card>
                <h3 className="font-semibold text-lg mb-4">Data Overview</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <div className="text-2xl font-bold text-blue-600">{project.cards_extracted}</div>
                    <div className="text-sm text-gray-700">Total Cards Extracted</div>
                  </div>
                  
                  <div className="bg-green-50 p-4 rounded-lg">
                    <div className="text-2xl font-bold text-green-600">{project.pages_scraped}</div>
                    <div className="text-sm text-gray-700">Pages Scraped</div>
                  </div>
                  
                  <div className="bg-purple-50 p-4 rounded-lg">
                    <div className="text-2xl font-bold text-purple-600">
                      {project.extracted_data.reduce((sum, item) => sum + item.links.length, 0)}
                    </div>
                    <div className="text-sm text-gray-700">Total Links Found</div>
                  </div>
                </div>
              </Card>
              
              <Card>
                <h3 className="font-semibold text-lg mb-4">Project Description</h3>
                <p className="text-gray-700">{project.description || "No description provided"}</p>
                <div className="mt-4">
                  <h4 className="font-medium text-gray-700">Project Details</h4>
                  <div className="mt-2 text-sm">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p><span className="font-medium">Project ID:</span> {project.project_id}</p>
                        <p><span className="font-medium">Created:</span> {formatDate(project.created_at)}</p>
                        <p><span className="font-medium">Status:</span> {project.status.replace('_', ' ')}</p>
                      </div>
                      <div>
                        <p><span className="font-medium">Cards Extracted:</span> {project.cards_extracted}</p>
                        <p><span className="font-medium">Pages Scraped:</span> {project.pages_scraped}</p>
                        <p><span className="font-medium">Last Updated:</span> {project.updated_at ? formatDate(project.updated_at) : "N/A"}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
              
              <Card>
                <h3 className="font-semibold text-lg mb-4">Sample Data</h3>
                {project.extracted_data.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {project.extracted_data.slice(0, 4).map((item, idx) => (
                      <div key={idx} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                        {item.title && (
                          <h4 className="font-medium text-blue-700 mb-2">{item.title}</h4>
                        )}
                        <p className="text-sm text-gray-700 line-clamp-3 mb-2">{item.text}</p>
                        {item.images && item.images.length > 0 && (
                          <div className="flex items-center gap-1 text-xs text-gray-500">
                            <HiPhotograph className="w-4 h-4" />
                            <span>{item.images.length} images</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 italic">No data extracted</p>
                )}
                {project.extracted_data.length > 4 && (
                  <div className="text-center mt-4">
                    <Badge color="light">
                      + {project.extracted_data.length - 4} more items
                    </Badge>
                  </div>
                )}
              </Card>
            </div>
          )}
        </TabItem>
        
        <TabItem title="Data Table" icon={HiTable} active={activeTab === 'data'}>
          {activeTab === 'data' && (
            <div>
              <h3 className="text-lg font-semibold mb-4">Extracted Data</h3>
              
              {project.extracted_data.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table striped>
                    <TableHead>
                      <TableHeadCell>Item</TableHeadCell>
                      <TableHeadCell>Title</TableHeadCell>
                      <TableHeadCell>Content</TableHeadCell>
                      <TableHeadCell>Links</TableHeadCell>
                      <TableHeadCell>Images</TableHeadCell>
                      {project.extracted_data.some(item => item.page_number !== undefined) && (
                        <TableHeadCell>Page</TableHeadCell>
                      )}
                    </TableHead>
                    <TableBody>
                      {project.extracted_data.map((item, idx) => (
                        <TableRow key={idx} className="bg-white">
                          <TableCell className="font-medium">{idx + 1}</TableCell>
                          <TableCell>{item.title || "No title"}</TableCell>
                          <TableCell className="max-w-xs">
                            <div className="truncate">
                              {item.text.substring(0, 100)}{item.text.length > 100 ? '...' : ''}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge color="blue">{item.links.length}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge color="purple">{item.images.length}</Badge>
                          </TableCell>
                          {project.extracted_data.some(item => item.page_number !== undefined) && (
                            <TableCell>
                              {item.page_number !== undefined ? item.page_number : '-'}
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-gray-500 italic">No data extracted</p>
              )}
            </div>
          )}
        </TabItem>
        
        <TabItem title="Images" icon={HiPhotograph} active={activeTab === 'images'}>
          {activeTab === 'images' && (
            <div>
              <h3 className="text-lg font-semibold mb-4">Extracted Images</h3>
              
              {project.extracted_data.some(item => item.images && item.images.length > 0) ? (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {project.extracted_data.flatMap((item, itemIdx) => 
                    item.images.map((imgUrl, imgIdx) => (
                      <div key={`${itemIdx}-${imgIdx}`} className="group">
                        <div className="relative aspect-square bg-gray-100 rounded overflow-hidden">
                          <img 
                            src={imgUrl} 
                            alt={`Image ${imgIdx + 1} from item ${itemIdx + 1}`}
                            className="w-full h-full object-cover transition-transform group-hover:scale-105"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.src = "https://via.placeholder.com/150?text=Image+Error";
                            }}
                          />
                          <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all flex items-end justify-center">
                            <div className="p-2 translate-y-full group-hover:translate-y-0 transition-transform w-full bg-white bg-opacity-75">
                              <a 
                                href={imgUrl} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-xs text-blue-600 hover:underline flex items-center justify-center"
                              >
                                View original <HiExternalLink className="ml-1" size={12} />
                              </a>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              ) : (
                <p className="text-gray-500 italic">No images found in the extracted data</p>
              )}
            </div>
          )}
        </TabItem>
        
        <TabItem title="Links" icon={HiLink} active={activeTab === 'links'}>
          {activeTab === 'links' && (
            <div>
              <h3 className="text-lg font-semibold mb-4">Extracted Links</h3>
              
              {project.extracted_data.some(item => item.links && item.links.length > 0) ? (
                <div className="space-y-6">
                  {project.extracted_data.map((item, itemIdx) => (
                    item.links.length > 0 && (
                      <Card key={itemIdx}>
                        <h4 className="font-medium text-blue-700 mb-2">
                          {item.title || `Item ${itemIdx + 1}`}
                        </h4>
                        <div className="space-y-2">
                          {item.links.map((link, linkIdx) => (
                            <div key={linkIdx} className="flex items-center gap-2">
                              <HiLink className="text-gray-400 flex-shrink-0" />
                              <a
                                href={link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline truncate"
                                title={link}
                              >
                                {link}
                              </a>
                            </div>
                          ))}
                        </div>
                      </Card>
                    )
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 italic">No links found in the extracted data</p>
              )}
            </div>
          )}
        </TabItem>
      </Tabs>
    </div>
  );
}
