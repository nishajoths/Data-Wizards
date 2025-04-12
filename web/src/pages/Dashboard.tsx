import { useEffect, useState } from "react";
import { Button, Card, Spinner, Alert } from "flowbite-react";
import Cookies from 'js-cookie';
import { Link } from "react-router-dom";
import { HiPlus, HiExternalLink, HiInformationCircle, HiTrash, HiViewGrid } from "react-icons/hi";
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
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
            <p className="text-gray-600">Welcome back, {name}</p>
          </div>
          <div className="flex gap-2">
            <Link to="/extension-projects">
              <Button color="purple">
                <HiViewGrid className="mr-2 h-5 w-5" />
                Extension Projects
              </Button>
            </Link>
            <Link to="/add-project">
              <Button color="blue">
                <HiPlus className="mr-2 h-5 w-5" />
                Add New Project
              </Button>
            </Link>
          </div>
        </div>
        
        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner size="xl" />
          </div>
        ) : (
          <div>
            {projects.length === 0 ? (
              <div className="text-center py-12 bg-gray-50 rounded-lg">
                <h2 className="text-xl font-semibold text-gray-700">No projects yet</h2>
                <p className="text-gray-500 mb-6">Get started by adding your first website for analysis</p>
                <Link to="/add-project">
                  <Button color="blue">
                    <HiPlus className="mr-2 h-5 w-5" />
                    Add New Project
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {projects.map((project) => (
                  <Card key={project._id}>
                    <div className="flex justify-between items-start">
                      <h5 className="text-lg font-bold text-gray-900 truncate">
                        {project.title || `Project ${project._id.substring(0, 8)}...`}
                      </h5>
                      <Button 
                        color="failure" 
                        size="xs" 
                        pill 
                        onClick={() => handleDeleteClick(project._id)}
                      >
                        <HiTrash className="h-4 w-4" />
                      </Button>
                    </div>
                    
                    <div className="text-sm text-gray-500">
                      <p>URL: {project.url || "Unknown URL"}</p>
                      <p>Pages found: {project.site_data?.sitemap_pages?.length || 0}</p>
                      {project.processing_status && (
                        <p>Scraped: {project.processing_status.pages_scraped || 0} pages</p>
                      )}
                    </div>
                    
                    <div className="mt-4">
                      <h6 className="text-sm font-medium text-gray-700">Sample Pages:</h6>
                      {project.site_data?.sitemap_pages && project.site_data.sitemap_pages.length > 0 ? (
                        <>
                          <ul className="list-disc pl-5 text-gray-500">
                            {project.site_data.sitemap_pages.slice(0, 3).map((page, i) => (
                              <li key={i} className="truncate text-xs">
                                <a href={page} target="_blank" rel="noopener noreferrer" className="flex items-center hover:underline">
                                  {page.substring(0, 30)}...
                                  <HiExternalLink className="ml-1 inline" />
                                </a>
                              </li>
                            ))}
                          </ul>
                          {project.site_data.sitemap_pages.length > 3 && (
                            <p className="text-xs text-gray-400 mt-1">
                              +{project.site_data.sitemap_pages.length - 3} more pages
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="text-xs text-gray-500 italic">No pages found</p>
                      )}
                    </div>
                    
                    <Link to={`/project/${project._id}`}>
                      <Button color="blue">
                        <HiExternalLink className="mr-2 h-5 w-5" />
                        View Project
                      </Button>
                    </Link>
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