import { Button, Label, TextInput, Spinner, Alert } from 'flowbite-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Cookies from 'js-cookie';
import { HiGlobe, HiExclamationCircle } from 'react-icons/hi';
import ExtractionLogs from '../components/ExtractionLogs';
import ScrapingOptions, { ScrapingPreferences } from '../components/ScrapingOptions';

export default function AddProject() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [processingStatus, setProcessingStatus] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [scrapingPreferences, setScrapingPreferences] = useState<ScrapingPreferences>({
    scrape_mode: 'limited',
    pages_limit: 5
  });
  const navigate = useNavigate();
  const token = Cookies.get('token');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!url.trim()) {
      setError('Please enter a valid URL');
      return;
    }

    setLoading(true);
    setError('');
    setProcessingStatus("Starting analysis...");
    
    try {
      if (!token) {
        throw new Error("Authentication token not found. Please log in again.");
      }

      // Ensure URL has the proper protocol
      let formattedUrl = url;
      if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
        formattedUrl = 'https://' + formattedUrl;
      }

      console.log('Submitting URL:', formattedUrl);
      setProcessingStatus("Submitting URL for analysis...");
      
      // Include scraping preferences in the request
      const response = await fetch('http://localhost:8000/add_project_with_scraping', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          url: formattedUrl,
          scrape_mode: scrapingPreferences.scrape_mode,
          pages_limit: scrapingPreferences.pages_limit
        }),
      });
      
      console.log('Response status:', response.status);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: "Failed to parse error" }));
        throw new Error(errorData.detail || `Failed to add project (${response.status})`);
      }
      
      const data = await response.json();
      console.log('Response data:', data);
      
      // Set client ID for WebSocket connection
      setClientId(data.client_id);
      setProcessingStatus("Project created! Extraction in progress...");
      
    } catch (err) {
      console.error('Error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
      setProcessingStatus(null);
      setLoading(false);
    }
  };

  const handleExtractionComplete = (data: any) => {
    // Navigate to the project details page with the completion data
    navigate(`/project-success`, { 
      state: { 
        projectData: {
          project_id: data.project_id,
          processing_status: data.processing_status
        } 
      }
    });
  };

  const handleExtractionInterrupt = async () => {
    if (!clientId || !token) return;
    
    try {
      setError('');
      
      const response = await fetch('http://localhost:8000/interrupt_extraction', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ client_id: clientId }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: "Failed to parse error" }));
        throw new Error(errorData.detail || `Failed to interrupt extraction (${response.status})`);
      }
      
      setProcessingStatus("Interrupting extraction...");
    } catch (err) {
      console.error('Error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-r from-blue-50 to-white py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto w-full">
        <div className="bg-white rounded-xl shadow-lg p-8 border border-blue-100 mb-6">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 mb-4">
              <HiGlobe className="w-8 h-8 text-blue-600" />
            </div>
            <h2 className="text-3xl font-extrabold text-gray-900">Add New Project</h2>
            <p className="mt-2 text-sm text-gray-600">Enter the URL of the website to analyze</p>
          </div>
          
          {error && (
            <Alert color="failure" className="mb-4">
              <div className="flex items-center">
                <HiExclamationCircle className="mr-2 h-5 w-5" />
                <span className="font-medium">Error:</span>
              </div>
              <p className="mt-1">{error}</p>
            </Alert>
          )}
          
          {processingStatus && !error && (
            <Alert color="info" className="mb-4">
              {processingStatus}
            </Alert>
          )}
          
          {!clientId && (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <Label htmlFor="url" className="text-sm font-medium text-gray-700 block mb-2">
                  Website URL
                </Label>
                <TextInput
                  id="url"
                  type="url"
                  placeholder="https://example.com"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  required
                  disabled={loading}
                />
                <p className="mt-1 text-xs text-gray-500">
                  Enter the root domain of the website (we'll find sitemaps and pages automatically)
                </p>
              </div>
              
              {/* Add scraping options component */}
              <ScrapingOptions 
                preferences={scrapingPreferences} 
                onChange={setScrapingPreferences} 
              />
              
              <Button
                type="submit"
                color="blue"
                className="w-full"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Spinner size="sm" className="mr-3" />
                    Processing...
                  </>
                ) : (
                  'Start Analysis'
                )}
              </Button>
            </form>
          )}
          
          {clientId && (
            <div className="space-y-4">
              <Alert color="success">
                <p className="font-medium">Project successfully created!</p>
                <p className="text-sm mt-1">
                  The extraction process is now running in the background. You can see the real-time logs below.
                </p>
              </Alert>
              
              <ExtractionLogs 
                clientId={clientId} 
                onComplete={handleExtractionComplete}
              />
              
              <div className="text-center text-sm text-gray-500 mt-4">
                <p>You can safely close this window, but the extraction will stop showing live updates.</p>
                <p>You'll be redirected automatically when extraction completes.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
