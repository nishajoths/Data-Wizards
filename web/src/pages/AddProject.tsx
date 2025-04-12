import { Button, Label, TextInput, Spinner, Alert, Badge, Card } from 'flowbite-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Cookies from 'js-cookie';
import { HiGlobe, HiExclamationCircle, HiCheck, HiX, HiSearch, HiPlus, HiTrash } from 'react-icons/hi';
import ExtractionLogs from '../components/ExtractionLogs';
import ScrapingOptions, { ScrapingPreferences } from '../components/ScrapingOptions';

let verificationDetails: any = null;

function setVerificationDetails(data: any) {
  verificationDetails = data;
}

export default function AddProject() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState('');
  const [processingStatus, setProcessingStatus] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [scrapingPreferences, setScrapingPreferences] = useState<ScrapingPreferences>({
    scrape_mode: 'all', // Always set to 'all'
    pages_limit: 0,     // Set to 0 to indicate no limit
    max_depth: 3        // Default to 3 levels of depth
  });
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchKeywords, setSearchKeywords] = useState<string[]>([]);
  const [includeMeta, setIncludeMeta] = useState(true);
  
  const navigate = useNavigate();
  const token = Cookies.get('token');

  const handleAddKeyword = () => {
    if (!searchKeyword.trim()) return;
    
    // Add keyword if not already in the list
    if (!searchKeywords.includes(searchKeyword.trim())) {
      setSearchKeywords([...searchKeywords, searchKeyword.trim()]);
    }
    setSearchKeyword('');
  };

  const handleRemoveKeyword = (keyword: string) => {
    setSearchKeywords(searchKeywords.filter(k => k !== keyword));
  };

  const handleVerify = async () => {
    if (!url.trim()) {
      setError('Please enter a valid URL');
      return;
    }

    setVerifying(true);
    setError('');
    setProcessingStatus("Verifying if website allows scraping...");
    
    try {
      if (!token) {
        throw new Error("Authentication token not found. Please log in again.");
      }

      // Ensure URL has the proper protocol
      let formattedUrl = url;
      if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
        formattedUrl = 'https://' + formattedUrl;
      }

      console.log('Verifying URL:', formattedUrl);
      
      // Call the verification endpoint
      const response = await fetch('http://localhost:8000/verify_scraping', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          url: formattedUrl
        }),
      });
      
      console.log('Verification response status:', response.status);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: "Failed to parse error" }));
        throw new Error(errorData.detail || `Failed to verify URL (${response.status})`);
      }
      
      const data = await response.json();
      console.log('Verification response data:', data);
      
      setVerificationDetails(data);
      setVerified(true);
      
      if (data.can_scrape) {
        setProcessingStatus(`Verification successful: ${data.message}`);
      } else {
        setError(`Verification failed: ${data.message}`);
        setProcessingStatus(null);
      }
      
    } catch (err) {
      console.error('Error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred during verification');
      setProcessingStatus(null);
      setVerified(false);
    } finally {
      setVerifying(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!url.trim()) {
      setError('Please enter a valid URL');
      return;
    }

    // Prevent submission if not verified
    if (!verified) {
      setError('Please verify the URL before starting analysis');
      return;
    }
    
    // Show warning but continue if verification failed
    if (verificationDetails && !verificationDetails.can_scrape) {
      setProcessingStatus("Warning: This website may not allow scraping, but proceeding anyway.");
    }

    setLoading(true);
    setError('');
    
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
      
      // Include scraping preferences, keywords, and max_depth in the request
      const response = await fetch('http://localhost:8000/add_project_with_scraping', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          url: formattedUrl,
          scrape_mode: 'all',
          pages_limit: 0,
          search_keywords: searchKeywords,
          include_meta: includeMeta,
          max_depth: scrapingPreferences.max_depth
        }),
      });
      
      console.log('Response status:', response.status);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: "Failed to parse error" }));
        console.error("Error response:", errorData);
        throw new Error(errorData.detail || `Failed to add project (${response.status})`);
      }
      
      const data = await response.json();
      console.log('Response data:', data);

      if (data.status === "blocked") {
        setError(data.error || "This website does not allow scraping according to its robots.txt or terms of service.");
        setLoading(false);
        setProcessingStatus(null);
        return;
      }
      
      // Set client ID for WebSocket connection
      setClientId(data.client_id);
      setProcessingStatus("Project created! Extraction in progress...");
      
    } catch (err) {
      console.error('Error:', err);
      setError(err instanceof Error ? err.message : JSON.stringify(err)); // Properly stringify error objects
      setProcessingStatus(null);
      setLoading(false);
    }
  };

  const handleExtractionComplete = (data: any) => {
    // Log the completion
    console.log("Extraction completed, data:", data);
    
    // Show an alert that we're redirecting
    setProcessingStatus(`Extraction ${data.processing_status.extraction_status}! Redirecting to project details...`);
    
    // Navigate to the project details page directly instead of the success page
    navigate(`/project/${data.project_id}`, { 
      state: { 
        fromExtraction: true,
        processingStatus: data.processing_status
      }
    });
  };

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUrl(e.target.value);
    // Reset verification when URL changes
    setVerified(false);
    setVerificationDetails(null);
  };

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="max-w-3xl mx-auto w-full">
        <Card className="border-gray-200 shadow-md mb-6">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 mb-4">
              <HiGlobe className="w-8 h-8 text-blue-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-800">Add New Project</h2>
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
              <div className="space-y-2">
                <Label htmlFor="url" className="text-sm font-medium text-gray-700 block mb-2">
                  Website URL
                </Label>
                <div className="flex flex-col md:flex-row gap-2">
                  <div className="flex-grow">
                    <TextInput
                      id="url"
                      type="url"
                      placeholder="https://example.com"
                      value={url}
                      onChange={handleUrlChange}
                      required
                      disabled={loading || verifying}
                      className="w-full"
                    />
                  </div>
                  <Button
                    type="button"
                    color={verified ? (verificationDetails?.can_scrape ? "success" : "failure") : "light"}
                    onClick={handleVerify}
                    disabled={verifying || loading || !url.trim()}
                    className="whitespace-nowrap transition-all hover:shadow"
                  >
                    {verifying ? (
                      <>
                        <Spinner size="sm" className="mr-2" />
                        Verifying...
                      </>
                    ) : verified ? (
                      <>
                        {verificationDetails?.can_scrape ? (
                          <>
                            <HiCheck className="mr-2 h-5 w-5" />
                            Verified
                          </>
                        ) : (
                          <>
                            <HiX className="mr-2 h-5 w-5" />
                            Not Allowed
                          </>
                        )}
                      </>
                    ) : (
                      "Verify URL"
                    )}
                  </Button>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  Enter the root domain of the website (we'll find sitemaps and pages automatically)
                </p>
              </div>
              
              {verified && (
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Verification Results</h4>
                  <div className="text-xs space-y-2">
                    {verificationDetails?.details?.robots_found ? (
                      <div className="flex items-center p-1.5 bg-gray-100 rounded">
                        <Badge color="success" className="mr-2">robots.txt</Badge>
                        <span className="text-gray-700">Found and analyzed</span>
                      </div>
                    ) : (
                      <div className="flex items-center p-1.5 bg-gray-100 rounded">
                        <Badge color="warning" className="mr-2">robots.txt</Badge>
                        <span className="text-gray-700">Not found</span>
                      </div>
                    )}
                    
                    {verificationDetails?.details?.terms_url ? (
                      <div className="flex items-center p-1.5 bg-gray-100 rounded">
                        <Badge color="success" className="mr-2">Terms</Badge>
                        <span className="text-gray-700 truncate flex-grow">Found at {verificationDetails.details.terms_url}</span>
                      </div>
                    ) : (
                      <div className="flex items-center p-1.5 bg-gray-100 rounded">
                        <Badge color="warning" className="mr-2">Terms</Badge>
                        <span className="text-gray-700">Not found</span>
                      </div>
                    )}
                    
                    <div className="flex items-center p-1.5 bg-gray-100 rounded">
                      <Badge color={verificationDetails?.can_scrape ? "success" : "failure"} className="mr-2">Result</Badge>
                      <span className="text-gray-700">{verificationDetails?.message}</span>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Keywords search section */}
              <Card className="mb-4 border border-gray-200">
                <h3 className="text-lg font-medium mb-4 flex items-center gap-2 text-gray-800">
                  <HiSearch className="text-blue-600" />
                  Keywords Search Filter
                </h3>
                
                <div className="space-y-4">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="keywords" className="text-sm font-medium text-gray-700">
                      Add keywords to search for (only pages containing these keywords will be scraped)
                    </Label>
                    
                    <div className="flex gap-2">
                      <TextInput
                        id="keywords"
                        type="text"
                        placeholder="Enter keyword"
                        value={searchKeyword}
                        onChange={(e) => setSearchKeyword(e.target.value)}
                        className="flex-grow"
                      />
                      <Button 
                        type="button"
                        onClick={handleAddKeyword}
                        disabled={!searchKeyword.trim()}
                        color="blue"
                        outline
                        className="hover:shadow transition-all"
                      >
                        <HiPlus className="mr-1 h-4 w-4" /> Add
                      </Button>
                    </div>
                    
                    <div className="flex items-center mt-2 bg-blue-50 p-2 rounded">
                      <input
                        id="include-meta"
                        type="checkbox"
                        checked={includeMeta}
                        onChange={(e) => setIncludeMeta(e.target.checked)}
                        className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                      />
                      <Label htmlFor="include-meta" className="ml-2 text-sm text-gray-600">
                        Search in meta information (title, description, keywords)
                      </Label>
                    </div>
                  </div>
                  
                  {searchKeywords.length > 0 && (
                    <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                      <Label className="text-sm font-medium text-gray-700 block mb-2">
                        Current keywords:
                      </Label>
                      <div className="flex flex-wrap gap-2">
                        {searchKeywords.map((keyword, index) => (
                          <div key={index} className="flex items-center bg-blue-100 text-blue-800 px-2.5 py-1.5 rounded-lg hover:bg-blue-200 transition-colors">
                            <span className="mr-2 font-medium">{keyword}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveKeyword(keyword)}
                              className="text-blue-700 hover:text-blue-900 transition-colors"
                              aria-label={`Remove keyword ${keyword}`}
                            >
                              <HiTrash className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </Card>
              
              {/* Add scraping options component */}
              <ScrapingOptions 
                preferences={scrapingPreferences} 
                onChange={setScrapingPreferences} 
              />
              
              <Button
                type="submit"
                color="blue"
                className="w-full hover:shadow-md transition-all"
                disabled={loading || !url.trim() || !verified}  // Require verification
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
              
              {!verified && url.trim() && (
                <div className="text-center mt-2 bg-yellow-50 p-2 rounded-lg border border-yellow-100">
                  <p className="text-yellow-700 text-sm flex items-center justify-center">
                    <HiExclamationCircle className="mr-1.5 h-4 w-4" />
                    Please verify the URL before starting analysis
                  </p>
                </div>
              )}
              
              {verified && !verificationDetails?.can_scrape && (
                <div className="text-center mt-2 bg-yellow-50 p-2 rounded-lg border border-yellow-100">
                  <p className="text-yellow-700 text-sm flex items-center justify-center">
                    <HiExclamationCircle className="mr-1.5 h-4 w-4" />
                    Warning: This website might not allow scraping. Proceed with caution.
                  </p>
                </div>
              )}
            </form>
          )}
          
          {clientId && (
            <div className="space-y-5">
              <Alert color="success" className="border border-green-200 bg-green-50">
                <p className="font-medium text-green-800">Project successfully created!</p>
                <p className="text-sm mt-1 text-green-700">
                  The extraction process is now running in the background. You can see the real-time logs below.
                </p>
                <p className="text-sm mt-2 font-medium text-green-800 bg-green-100 p-2 rounded">
                  Note: The extraction continues as a background process on the server even if you close this page.
                </p>
              </Alert>
              
              <ExtractionLogs 
                clientId={clientId} 
                onComplete={handleExtractionComplete}
              />
              
              <div className="text-center mt-4 p-4 border border-gray-200 rounded-lg bg-gray-50 shadow-sm">
                <p className="text-gray-700">The data extraction will continue in the background even if you close this window.</p>
                <p className="text-gray-700 mb-3">You can return to your dashboard and view your projects at any time.</p>
                <Button 
                  color="blue"
                  outline
                  size="sm"
                  onClick={() => navigate('/dashboard')}
                  className="hover:shadow transition-all"
                >
                  Back to Dashboard
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

