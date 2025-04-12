import { useEffect, useState } from "react";
import { Card, Button, Spinner, Alert, Badge, Table, Pagination, TableHead, TableHeadCell, TableBody, TableRow, TableCell } from "flowbite-react";
import { Link } from "react-router-dom";
import Cookies from 'js-cookie';
import { 
  HiExternalLink, 
  HiRefresh, 
  HiInformationCircle,
  HiCheck,
  HiClock,
  HiX,
  HiCode,
  HiViewGrid,
  HiArrowRight,
  HiDownload,
  HiEye
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

export default function ExtensionProjectsList() {
  const [projects, setProjects] = useState<ExtensionProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedProject, setExpandedProject] = useState<string | null>(null);
  const token = Cookies.get('token');
  
  const itemsPerPage = 10;
  const totalPages = Math.ceil(projects.length / itemsPerPage);
  
  const fetchProjects = async () => {
    if (!token) {
      setError("Authentication token not found");
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      const response = await fetch('http://localhost:8000/api/extension-projects', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch projects: ${response.status}`);
      }
      
      const data = await response.json();
      setProjects(data.projects || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unknown error occurred");
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    fetchProjects();
  }, []);
  
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <HiCheck className="w-5 h-5 text-green-500" />;
      case 'in_progress':
        return <Spinner size="sm" className="text-blue-500" />;
      case 'queued':
        return <HiClock className="w-5 h-5 text-yellow-500" />;
      case 'failed':
        return <HiX className="w-5 h-5 text-red-500" />;
      default:
        return <HiInformationCircle className="w-5 h-5 text-gray-500" />;
    }
  };
  
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const toggleExpand = (projectId: string) => {
    if (expandedProject === projectId) {
      setExpandedProject(null);
    } else {
      setExpandedProject(projectId);
    }
  };
  
  const downloadProjectData = (project: ExtensionProject) => {
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
  
  const onPageChange = (page: number) => {
    setCurrentPage(page);
    setExpandedProject(null); // Close any expanded project when changing pages
  };
  
  const paginatedProjects = projects.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );
  
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Extension Projects</h1>
          <p className="text-gray-600">Data extracted using the browser extension</p>
        </div>
        <div className="flex gap-2">
          <Button color="light" onClick={fetchProjects}>
            <HiRefresh className="mr-2" />
            Refresh
          </Button>
        </div>
      </div>
      
      {error && (
        <Alert color="failure" className="mb-4">
          <h3 className="font-medium">Error loading projects</h3>
          <p>{error}</p>
        </Alert>
      )}
      
      <Card className="mb-6">
        <div className="p-4 bg-blue-50 border border-blue-100 rounded-lg">
          <h2 className="text-xl font-semibold text-blue-800 mb-2">Extension Projects</h2>
          <p className="text-blue-700 mb-2">
            These projects were created using the browser extension by visually selecting elements on web pages.
          </p>
          <div className="flex items-center gap-2 text-sm text-blue-800">
            <HiInformationCircle className="w-5 h-5" />
            <span>Click on a project row to view the extracted data</span>
          </div>
        </div>
      </Card>
      
      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner size="xl" />
        </div>
      ) : (
        <div>
          {projects.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-lg">
              <h3 className="text-xl font-semibold text-gray-700">No extension projects yet</h3>
              <p className="text-gray-500 mb-6">Use the browser extension to create your first project</p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <Table hoverable>
                  <TableHead>
                    <TableHeadCell>Project Name</TableHeadCell>
                    <TableHeadCell>Website</TableHeadCell>
                    <TableHeadCell>Status</TableHeadCell>
                    <TableHeadCell>Extracted</TableHeadCell>
                    <TableHeadCell>Date Created</TableHeadCell>
                    <TableHeadCell>Actions</TableHeadCell>
                  </TableHead>
                  <TableBody>
                    {paginatedProjects.map((project) => (
                      <>
                        <TableRow 
                          key={project._id} 
                          className="cursor-pointer hover:bg-gray-50"
                          onClick={() => toggleExpand(project.project_id)}
                        >
                          <TableCell className="font-medium text-gray-900">
                            {project.name || project.url.split('/')[2]}
                          </TableCell>
                          <TableCell className="max-w-xs truncate">
                            <a 
                              href={project.url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-blue-600 hover:underline flex items-center"
                            >
                              {new URL(project.url).hostname}
                              <HiExternalLink className="ml-1 inline" />
                            </a>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getStatusIcon(project.status)}
                              <span className="capitalize">{project.status.replace('_', ' ')}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span>{project.cards_extracted} items</span>
                              <span className="text-xs text-gray-500">{project.pages_scraped} pages</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            {formatDate(project.created_at)}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button 
                                size="xs" 
                                color="light"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  downloadProjectData(project);
                                }}
                                title="Download Data"
                              >
                                <HiDownload className="w-4 h-4" />
                              </Button>
                              <Link to={`/extension-project/${project.project_id}`}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Button 
                                  size="xs" 
                                  color="blue"
                                  title="View Details"
                                >
                                  <HiEye className="w-4 h-4" />
                                </Button>
                              </Link>
                            </div>
                          </TableCell>
                        </TableRow>
                        
                        {expandedProject === project.project_id && (
                          <TableRow className="bg-gray-50">
                            <TableCell colSpan={6} className="p-4">
                              <div className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div className="space-y-2">
                                    <h3 className="text-lg font-semibold">Project Details</h3>
                                    <p className="text-sm text-gray-700">
                                      <span className="font-medium">Description:</span> {project.description || "No description"}
                                    </p>
                                    <p className="text-sm text-gray-700">
                                      <span className="font-medium">Project ID:</span> {project.project_id}
                                    </p>
                                    <p className="text-sm text-gray-700">
                                      <span className="font-medium">Created:</span> {formatDate(project.created_at)}
                                    </p>
                                    {project.updated_at && (
                                      <p className="text-sm text-gray-700">
                                        <span className="font-medium">Last Updated:</span> {formatDate(project.updated_at)}
                                      </p>
                                    )}
                                  </div>
                                  
                                  <div className="space-y-2">
                                    <h3 className="text-lg font-semibold">Selectors</h3>
                                    <div className="p-2 bg-gray-100 rounded overflow-auto">
                                      <p className="text-sm font-mono">
                                        <span className="font-medium text-blue-600">Card:</span> {project.card_selector}
                                      </p>
                                      {project.pagination_selector && (
                                        <p className="text-sm font-mono">
                                          <span className="font-medium text-purple-600">Pagination:</span> {project.pagination_selector}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                
                                <div>
                                  <h3 className="text-lg font-semibold mb-2">Extracted Data</h3>
                                  {project.extracted_data && project.extracted_data.length > 0 ? (
                                    <div className="space-y-3">
                                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        {project.extracted_data.slice(0, 3).map((item, idx) => (
                                          <div key={idx} className="border border-gray-200 rounded-lg p-3 bg-white">
                                            {item.title && (
                                              <h4 className="font-medium text-blue-700">{item.title}</h4>
                                            )}
                                            <p className="text-sm text-gray-600 line-clamp-3">{item.text}</p>
                                            {item.images && item.images.length > 0 && (
                                              <div className="mt-2">
                                                <p className="text-xs text-gray-500">{item.images.length} images</p>
                                              </div>
                                            )}
                                            {item.links && item.links.length > 0 && (
                                              <div className="mt-1">
                                                <p className="text-xs text-gray-500">{item.links.length} links</p>
                                              </div>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                      
                                      {project.extracted_data.length > 3 && (
                                        <div className="text-center">
                                          <Badge color="light" className="text-xs">
                                            + {project.extracted_data.length - 3} more items
                                          </Badge>
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <p className="text-sm text-gray-500 italic">No data extracted yet</p>
                                  )}
                                </div>
                                
                                <div className="flex justify-end">
                                  <Link to={`/extension-project/${project.project_id}`}>
                                    <Button 
                                      size="sm" 
                                      color="blue"
                                    >
                                      <div className="flex items-center gap-2">
                                        <span>View Complete Project</span>
                                        <HiArrowRight />
                                      </div>
                                    </Button>
                                  </Link>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    ))}
                  </TableBody>
                </Table>
              </div>
              
              {totalPages > 1 && (
                <div className="flex justify-center mt-4">
                  <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={onPageChange}
                    showIcons
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
