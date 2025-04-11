import { useEffect, useState } from 'react';
import { Card, Button, Alert, Progress } from 'flowbite-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { HiCheckCircle, HiExclamationCircle, HiExternalLink, HiInformationCircle } from 'react-icons/hi';

interface ProcessingStatus {
  robots_status: string;
  sitemap_status: string;
  pages_found: number;
  pages_scraped: number;
  errors: string[];
  scrape_mode?: string;
  pages_limit?: number;
}

interface ProjectData {
  project_id: string;
  processing_status: ProcessingStatus;
}

export default function ProjectSuccess() {
  const location = useLocation();
  const navigate = useNavigate();
  const [projectData, setProjectData] = useState<ProjectData | null>(null);

  useEffect(() => {
    // Get project data from location state
    const data = location.state?.projectData;
    
    if (!data) {
      // If no data is passed, redirect to dashboard
      navigate('/dashboard');
      return;
    }

    setProjectData(data);
  }, [location, navigate]);

  if (!projectData) {
    return (
      <div className="min-h-screen bg-gray-50 flex justify-center items-center">
        <Card className="max-w-md mx-auto text-center">
          <div>
            <HiExclamationCircle className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-lg font-medium text-gray-900">No project data available</h3>
            <p className="mt-1 text-sm text-gray-500">Redirecting to dashboard...</p>
            <div className="mt-6">
              <Link to="/dashboard">
                <Button color="blue">Go to Dashboard</Button>
              </Link>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  const { project_id, processing_status } = projectData;
  const { robots_status, sitemap_status, pages_found, pages_scraped, errors, scrape_mode, pages_limit } = processing_status;

  const getStatusIcon = (status: string) => {
    if (status === 'success') return <HiCheckCircle className="w-6 h-6 text-green-500" />;
    if (status === 'error' || status === 'failed') return <HiExclamationCircle className="w-6 h-6 text-red-500" />;
    return <HiInformationCircle className="w-6 h-6 text-blue-500" />;
  };

  const calculateProgressPercentage = () => {
    if (pages_found === 0) return 100;
    const percentage = (pages_scraped / pages_found) * 100;
    return Math.round(percentage);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="container mx-auto px-4">
        <Card className="max-w-3xl mx-auto">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
              <HiCheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900">Project Added Successfully!</h1>
            <p className="text-gray-600 mt-2">
              Your project has been created and analysis has been completed with the following results.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="p-4 border rounded-lg bg-white">
              <div className="flex items-center">
                {getStatusIcon(robots_status)}
                <div className="ml-3">
                  <h3 className="font-medium">Robots.txt Processing</h3>
                  <p className="text-sm text-gray-500">
                    {robots_status === 'success'
                      ? 'Successfully processed robots.txt'
                      : robots_status === 'not_processed' 
                      ? 'Robots.txt was not processed'
                      : 'Failed to process robots.txt'}
                  </p>
                </div>
              </div>
            </div>

            <div className="p-4 border rounded-lg bg-white">
              <div className="flex items-center">
                {getStatusIcon(sitemap_status)}
                <div className="ml-3">
                  <h3 className="font-medium">Sitemap Processing</h3>
                  <p className="text-sm text-gray-500">
                    {sitemap_status === 'success'
                      ? `Found ${pages_found} pages in sitemap`
                      : sitemap_status === 'not_processed'
                      ? 'Sitemap was not processed'
                      : 'Failed to process sitemap'}
                  </p>
                </div>
              </div>
            </div>

            <div className="p-4 border rounded-lg bg-white">
              <div className="flex items-center">
                <HiInformationCircle className="w-6 h-6 text-blue-500" />
                <div className="ml-3">
                  <h3 className="font-medium">Scraping Mode</h3>
                  <p className="text-sm text-gray-500">
                    {scrape_mode === 'all'
                      ? 'All pages were targeted for scraping'
                      : `Limited to ${pages_limit || 5} pages`}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="mb-6">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-medium text-lg">Pages Scraped: {pages_scraped}</h3>
              <span className="text-sm text-gray-600">{calculateProgressPercentage()}% Complete</span>
            </div>
            <Progress
              progress={calculateProgressPercentage()}
              color="blue"
              size="lg"
            />
          </div>

          {errors.length > 0 && (
            <Alert color="warning" className="mb-6">
              <h4 className="font-medium">Some issues were encountered</h4>
              <ul className="list-disc pl-5 mt-2 text-sm">
                {errors.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            </Alert>
          )}

          <div className="flex flex-col sm:flex-row justify-center gap-4 mt-4">
            <Link to={`/project/${project_id}`}>
              <Button color="blue">
                <HiExternalLink className="mr-2 h-5 w-5" />
                View Project Details
              </Button>
            </Link>
            <Link to="/dashboard">
              <Button color="light">
                Return to Dashboard
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
