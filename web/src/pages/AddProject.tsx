import { Button, Label, TextInput, Spinner, Alert } from 'flowbite-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Cookies from 'js-cookie';
import { HiGlobe, HiExclamationCircle } from 'react-icons/hi';

export default function AddProject() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [processingStatus, setProcessingStatus] = useState<string | null>(null);
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
      
      const response = await fetch('http://localhost:8000/add_project_with_scraping', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ url: formattedUrl }),
      });
      
      console.log('Response status:', response.status);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: "Failed to parse error" }));
        throw new Error(errorData.detail || `Failed to add project (${response.status})`);
      }
      
      const data = await response.json();
      console.log('Response data:', data);
      
      setProcessingStatus("Project added successfully! Redirecting...");
      
      // Short delay before redirecting to ensure user sees success message
      setTimeout(() => {
        navigate(`/project/${data.project_id}`);
      }, 1500);
      
    } catch (err) {
      console.error('Error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
      setProcessingStatus(null);
    } finally {
      if (!error) {
        // Only reset loading if we're not showing an error
        // This gives the user time to read the error message
        setTimeout(() => setLoading(false), 1500);
      } else {
        setLoading(false);
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-r from-blue-50 to-white py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 border border-blue-100">
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
        
        {loading && (
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              This may take several minutes depending on the size of the website.
              Please don't close this window.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
