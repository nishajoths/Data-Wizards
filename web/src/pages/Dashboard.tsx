import { useEffect, useState } from "react";
import { Button, Card, Spinner, Alert, Badge, Tooltip } from "flowbite-react";
import Cookies from 'js-cookie';
import { Link } from "react-router-dom";
import { HiPlus, HiExternalLink, HiInformationCircle, HiTrash, HiViewGrid, HiCalendar, HiGlobe, HiDocument, HiCheck } from "react-icons/hi";
import DeleteConfirmationModal from "../components/DeleteConfirmationModal";

interface Project {
  _id: string;
  url: string;
  title?: string;
  user_email: string;
  site_data: {
    robots_id: string;
    sitemap_pages: string[];
    scraped_pages?: string[];
  };
  processing_status?: {
    robots_status: string;
    sitemap_status: string;
    pages_found: number;
    pages_scraped: number;
    errors: string[];
  };
  created_at?: string;
}

export default function Dashboard() {
    const token = Cookies.get('token');
    const [name, setName] = useState("");
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [projectToDelete, setProjectToDelete] = useState<string | null>(null);
    const [deleteLoading, setDeleteLoading] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    const fetchProjects = async () => {
        try {
            if (!token) {
                throw new Error("Authentication token not found");
            }

            setLoading(true);
            setError(null);

            // Fetch user information
            const userRes = await fetch('http://localhost:8000/me', {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });
            
            if (!userRes.ok) {
                const errorData = await userRes.json().catch(() => ({ detail: "Failed to parse error" }));
                throw new Error(errorData.detail || "Failed to fetch user information");
            }
            
            const userData = await userRes.json();
            setName(userData.name);
            
            // Fetch projects
            const projectsRes = await fetch('http://localhost:8000/projects', {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });
            
            if (!projectsRes.ok) {
                const errorData = await projectsRes.json().catch(() => ({ detail: "Failed to parse error" }));
                throw new Error(errorData.detail || "Failed to fetch projects");
            }
            
            const projectsData = await projectsRes.json();
            console.log("Projects data:", projectsData);
            
            if (Array.isArray(projectsData.projects)) {
                setProjects(projectsData.projects);
            } else {
                console.warn("Projects data is not an array:", projectsData);
                setProjects([]);
            }
        } catch (error) {
            console.error("Error fetching data:", error);
            setError(error instanceof Error ? error.message : "An unknown error occurred");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchProjects();
    }, [token]);

    const handleDeleteClick = (projectId: string) => {
        setProjectToDelete(projectId);
        setDeleteModalOpen(true);
        setDeleteError(null);
    };

    const handleDeleteConfirm = async () => {
        if (!projectToDelete || !token) return;

        try {
            setDeleteLoading(true);
            setDeleteError(null);

            const response = await fetch(`http://localhost:8000/projects/${projectToDelete}`, {
                method: 'DELETE',
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ detail: "Failed to parse error" }));
                throw new Error(errorData.detail || `Failed to delete project (${response.status})`);
            }

            // Remove the deleted project from the list
            setProjects(projects.filter(project => project._id !== projectToDelete));
            setDeleteModalOpen(false);
            setProjectToDelete(null);
        } catch (err) {
            console.error('Error deleting project:', err);
            setDeleteError(err instanceof Error ? err.message : 'An error occurred while deleting');
        } finally {
            setDeleteLoading(false);
        }
    };

    // Format date helper function
    const formatDate = (dateString?: string) => {
        if (!dateString) return "Unknown date";
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    // Get status color helper function
    const getStatusColor = (status?: string) => {
        if (!status) return "gray";
        switch(status.toLowerCase()) {
            case "completed": return "success";
            case "in_progress": return "info";
            case "pending": return "warning";
            case "failed": return "failure";
            default: return "gray";
        }
    };
    
    // Format URL for display
    const formatUrl = (url: string) => {
        try {
            const urlObj = new URL(url);
            return urlObj.hostname + (urlObj.pathname !== "/" ? urlObj.pathname : "");
        } catch (e) {
            return url;
        }
    };

    // Get domain name from URL
    const getDomainFromUrl = (url: string) => {
      try {
        const urlObj = new URL(url);
        return urlObj.hostname.replace('www.', '').replace(/^https?:\/\//, '');
      } catch (e) {
        return url.replace(/^https?:\/\//, '');
      }
    };

    if (error) {
        return (
            <div className="container mx-auto px-4 py-8">
                <Alert color="failure" className="mb-4">
                    <div className="flex items-center">
                        <HiInformationCircle className="mr-2 h-5 w-5" />
                        <h3 className="font-medium">Error loading dashboard</h3>
                    </div>
                    <p className="mt-2">{error}</p>
                </Alert>
                <Link to="/login">
                    <Button color="blue">
                        Return to Login
                    </Button>
                </Link>
            </div>
        );
    }

    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-1">My Projects</h1>
            <p className="text-gray-600 flex items-center">
              <span className="mr-2">Welcome back, {name}</span>
              {!loading && <Badge color="gray" size="sm">{projects.length} Project{projects.length !== 1 ? 's' : ''}</Badge>}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/extension-projects">
              <Button color="purple" className="transition-all hover:shadow-md">
                <HiViewGrid className="mr-2 h-5 w-5" />
                Extension Projects
              </Button>
            </Link>
            <Link to="/add-project">
              <Button color="blue" className="transition-all hover:shadow-md">
                <HiPlus className="mr-2 h-5 w-5" />
                Add New Project
              </Button>
            </Link>
          </div>
        </div>
        
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 bg-gray-50 rounded-lg">
            <Spinner size="xl" />
            <p className="mt-4 text-gray-600">Loading your projects...</p>
          </div>
        ) : (
          <div>
            {projects.length === 0 ? (
              <div className="text-center py-16 bg-gray-50 rounded-lg border border-gray-200 shadow-sm">
                <div className="mx-auto w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-4">
                  <HiDocument className="h-8 w-8 text-blue-500" />
                </div>
                <h2 className="text-2xl font-semibold text-gray-700 mb-2">No projects yet</h2>
                <p className="text-gray-500 mb-6 max-w-md mx-auto">Get started by adding your first website for analysis and create your data insights dashboard.</p>
                <Link to="/add-project">
                  <Button color="blue" size="lg" className="hover:shadow-lg transition-all">
                    <HiPlus className="mr-2 h-5 w-5" />
                    Create Your First Project
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {projects.map((project) => (
                  <Card key={project._id} className="overflow-hidden hover:shadow-md transition-all border border-gray-200">
                    <div className="flex justify-between items-start mb-2">
                      <h5 className="text-xl font-bold text-gray-900 truncate">
                        {formatUrl(project.url || "Unknown URL") || `Project ${formatUrl(project.url || "Unknown URL")}`}
                      </h5>
                      <Tooltip content="Delete Project">
                        <Button 
                          color="failure" 
                          size="xs" 
                          pill 
                          onClick={() => handleDeleteClick(project._id)}
                        >
                          <HiTrash className="h-4 w-4" />
                        </Button>
                      </Tooltip>
                    </div>
                    
                    <div className="bg-gray-50 p-3 rounded-lg mb-4">
                      <div className="flex justify-between mb-1">
                        <div className="flex items-center">
                          <Badge color={getStatusColor(project.processing_status?.sitemap_status)} className="mr-2">
                            {project.processing_status?.sitemap_status || "Pending"}
                          </Badge>
                          <span className="text-sm font-medium">Site Analysis</span>
                        </div>
                        <div className="text-sm font-semibold">
                          {project.site_data?.sitemap_pages?.length || 0} pages
                        </div>
                      </div>
                      
                      {project.processing_status && (
                        <div className="w-full bg-gray-200 rounded-full h-2.5 mt-1.5">
                          <div 
                            className="bg-blue-600 h-2.5 rounded-full" 
                            style={{ 
                              width: `${project.processing_status.pages_found > 0 ? 
                                (project.processing_status.pages_scraped / project.processing_status.pages_found) * 100 : 0}%` 
                            }}
                          />
                        </div>
                      )}
                      
                      <div className="flex items-center justify-between text-xs text-gray-500 mt-1.5">
                        <span>
                          {project.processing_status?.pages_scraped || 0}/{project.processing_status?.pages_found || 0} pages scraped
                        </span>
                        {project.processing_status?.sitemap_status === "completed" && (
                          <span className="flex items-center text-green-600">
                            <HiCheck className="mr-1 h-3 w-3" /> Complete
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <div className="mb-4">
                      <h6 className="text-sm font-medium text-gray-700 mb-2 flex items-center">
                        <HiDocument className="mr-1.5 h-4 w-4" />
                        Sample Pages:
                      </h6>
                      {project.site_data?.sitemap_pages && project.site_data.sitemap_pages.length > 0 ? (
                        <div className="bg-gray-50 rounded-md p-2">
                          <ul className="space-y-1.5 text-gray-500">
                            {project.site_data.sitemap_pages.slice(0, 3).map((page, i) => (
                              <li key={i} className="truncate text-xs hover:bg-gray-100 rounded p-1">
                                <a 
                                  href={page} 
                                  target="_blank" 
                                  rel="noopener noreferrer" 
                                  className="flex items-center hover:text-blue-600"
                                  title={page}
                                >
                                  <span className="inline-block w-4 h-4 bg-blue-100 text-blue-800 rounded-full text-[10px] flex items-center justify-center mr-1.5">
                                    {i+1}
                                  </span>
                                  {formatUrl(page)}
                                  <HiExternalLink className="ml-1 inline h-3 w-3 flex-shrink-0" />
                                </a>
                              </li>
                            ))}
                          </ul>
                          {project.site_data.sitemap_pages.length > 3 && (
                            <p className="text-xs text-gray-400 mt-1.5 pl-1">
                              +{project.site_data.sitemap_pages.length - 3} more pages
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-500 italic bg-gray-50 p-2 rounded">No pages found</p>
                      )}
                    </div>
                    
                    {project.created_at && (
                      <div className="text-xs text-gray-500 mb-3 flex items-center">
                        <HiCalendar className="mr-1.5 h-3 w-3" />
                        Created: {formatDate(project.created_at)}
                      </div>
                    )}
                    
                    <div className="flex gap-2">
                      <Link to={`/project/${project._id}`} className="flex-1">
                        <Button color="blue" className="w-full hover:shadow transition-all">
                          <HiExternalLink className="mr-2 h-5 w-5" />
                          View Project
                        </Button>
                      </Link>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Delete Confirmation Modal */}
        <DeleteConfirmationModal 
          isOpen={deleteModalOpen}
          onClose={() => setDeleteModalOpen(false)}
          onConfirm={handleDeleteConfirm}
          isLoading={deleteLoading}
        />

        {/* Error Alert for Delete Operation */}
        {deleteError && (
          <Alert color="failure" className="mt-4">
            <div className="flex items-center">
              <HiInformationCircle className="mr-2 h-5 w-5" />
              <h3 className="font-medium">Error deleting project</h3>
            </div>
            <p className="mt-1">{deleteError}</p>
          </Alert>
        )}
      </div>
    );
}