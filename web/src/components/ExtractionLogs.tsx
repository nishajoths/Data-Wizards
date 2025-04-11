import { useEffect, useState, useRef } from 'react';
import { Alert, Badge, Card, Spinner, Button, Tabs, TabItem } from 'flowbite-react';
import { HiInformationCircle, HiExclamationCircle, HiCheckCircle, HiStop, HiCog, HiLightningBolt, HiSearch, HiX } from 'react-icons/hi';
import Cookies from 'js-cookie';

interface LogEntry {
  type: string;
  timestamp: string;
  message: string;
}

interface WebSocketMessage {
  type: string;
  timestamp: string;
  message: string;
}

interface ExtractionStats {
  totalPages: number;
  scrapedPages: number;
  elementsExtracted: number;
  bytesProcessed: number;
  startTime: string | null;
  progress: number;
  elapsed: number;
}

interface NetworkStats {
  avgSpeed: number;  // KB/s
  totalSize: number; // KB
  totalTime: number; // ms
  requestCount: number;
}

interface ExtractionLogsProps {
  clientId: string;
  onComplete?: (data: any) => void;
}

// Enhancement to parse scraping mode from logs
const parseScrapeMode = (logs: LogEntry[]): string => {
  const scrapeModeLog = logs.find(log => 
    log.message.toLowerCase().includes('scraping mode:')
  );
  
  if (scrapeModeLog) {
    return scrapeModeLog.message;
  }
  
  return 'Default scraping mode';
};

export default function ExtractionLogs({ clientId, onComplete }: ExtractionLogsProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [connected, setConnected] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [interruptRequested, setInterruptRequested] = useState<boolean>(false);
  const [stats, setStats] = useState<ExtractionStats>({
    totalPages: 0,
    scrapedPages: 0,
    elementsExtracted: 0,
    bytesProcessed: 0,
    startTime: null,
    progress: 0,
    elapsed: 0
  });
  const [networkStats, setNetworkStats] = useState<NetworkStats>({
    avgSpeed: 0,
    totalSize: 0,
    totalTime: 0,
    requestCount: 0
  });
  const [isDetailViewExpanded, setIsDetailViewExpanded] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<string>('main');
  const socketRef = useRef<WebSocket | null>(null);
  const logsEndRef = useRef<HTMLDivElement | null>(null);
  const token = Cookies.get('token');
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Add state for keyword search results
  const [keywordMatches, setKeywordMatches] = useState<Record<string, string[]>>({});
  const [keywordContexts, setKeywordContexts] = useState<Record<string, Record<string, string>>>({});

  // Add state for sitemap information
  const [sitemapDetails, setSitemapDetails] = useState<{
    found: boolean;
    pagesCount: number;
    samplePages: string[];
    errors: string[];
  }>({
    found: false,
    pagesCount: 0,
    samplePages: [],
    errors: []
  });

  // Add state for keyword search status
  const [keywordSearchStatus, setKeywordSearchStatus] = useState<{
    performed: boolean;
    termsSearched: string[];
    pagesChecked: number;
    pagesMatched: number;
    noMatchesFound: boolean;
  }>({
    performed: false,
    termsSearched: [],
    pagesChecked: 0,
    pagesMatched: 0,
    noMatchesFound: false
  });

  useEffect(() => {
    // Connect to WebSocket
    const wsUrl = `ws://localhost:8000/ws/${clientId}`;
    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;

    socket.onopen = () => {
      setConnected(true);
      setLogs((prevLogs) => [
        ...prevLogs,
        {
          type: 'info',
          timestamp: new Date().toISOString(),
          message: 'Connected to extraction stream',
        },
      ]);
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as WebSocketMessage;
        
        // Handle different message types
        if (data.type === 'completion') {
          // Handle completion message
          const completionData = JSON.parse(data.message);
          if (onComplete) {
            onComplete(completionData);
          }
        } else if (data.type === 'detail') {
          // Update statistics based on detail messages
          updateStats(data.message);
        } else if (data.type === 'network') {
          // Process network log messages to update stats
          const message = data.message;
          if (message.includes('KB/s')) {
            // Extract data from network messages
            const speedMatch = message.match(/Speed: ([\d.]+)KB\/s/);
            const sizeMatch = message.match(/Size: ([\d.]+)KB/);
            const timeMatch = message.match(/loaded in (\d+)ms/);
            
            if (speedMatch && sizeMatch && timeMatch) {
              const speed = parseFloat(speedMatch[1]);
              const size = parseFloat(sizeMatch[1]);
              const time = parseInt(timeMatch[1]);
              
              setNetworkStats(prev => ({
                avgSpeed: prev.requestCount ? (prev.avgSpeed * prev.requestCount + speed) / (prev.requestCount + 1) : speed,
                totalSize: prev.totalSize + size,
                totalTime: prev.totalTime + time,
                requestCount: prev.requestCount + 1
              }));
            }
          }
        } else if (data.type === 'system' && data.message.includes('interrupt')) {
          // Set interrupt flag when server confirms it
          setInterruptRequested(true);
        }
        
        setLogs((prevLogs) => [...prevLogs, data]);
        updateStats(data.message);

        // Extract keyword search status
        if (data.message.includes("Using keyword filter:")) {
          const match = data.message.match(/Using keyword filter: (.+)/);
          if (match) {
            const keywords = match[1].split(', ');
            setKeywordSearchStatus(prev => ({
              ...prev,
              performed: true,
              termsSearched: keywords
            }));
          }
        }
        
        // Track pages checked for keywords
        if (data.message.includes("Checking page") && data.message.includes("for keywords:")) {
          setKeywordSearchStatus(prev => ({
            ...prev,
            pagesChecked: prev.pagesChecked + 1
          }));
        }
        
        // Track when pages contain keywords
        if (data.message.includes("contains keywords:")) {
          setKeywordSearchStatus(prev => ({
            ...prev,
            pagesMatched: prev.pagesMatched + 1
          }));
        }
        
        // Track when no matches are found
        if (data.message.includes("No pages containing the specified keywords were found")) {
          setKeywordSearchStatus(prev => ({
            ...prev,
            noMatchesFound: true
          }));
        }
      } catch (err) {
        console.error('Error parsing WebSocket message:', err);
      }
    };

    socket.onclose = () => {
      setConnected(false);
      setLogs((prevLogs) => [
        ...prevLogs,
        {
          type: 'info',
          timestamp: new Date().toISOString(),
          message: 'Disconnected from extraction stream',
        },
      ]);
    };

    socket.onerror = (err) => {
      setError('Failed to connect to the extraction stream');
      console.error('WebSocket error:', err);
    };

    // Start a timer to calculate elapsed time
    timerRef.current = setInterval(() => {
      if (stats.startTime) {
        const start = new Date(stats.startTime).getTime();
        const now = new Date().getTime();
        const elapsed = (now - start) / 1000; // seconds
        setStats(prev => ({...prev, elapsed}));
      }
    }, 1000);

    // Clean up on unmount
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
    };
  }, [clientId, onComplete]);

  // Auto scroll to bottom when new logs come in
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const updateStats = (message: string) => {
    // Extract statistics from detail messages
    if (!stats.startTime) {
      setStats(prev => ({...prev, startTime: new Date().toISOString()}));
    }

    if (message.includes("Found") && message.includes("pages in sitemap")) {
      const match = message.match(/Found (\d+) pages in sitemap/);
      if (match && match[1]) {
        const pagesCount = parseInt(match[1]);
        setStats(prev => ({...prev, totalPages: pagesCount}));
        setSitemapDetails(prev => ({...prev, found: true, pagesCount}));
      }
    }
    
    if (message.includes("Extracted") && message.includes("elements")) {
      const match = message.match(/Extracted (\d+) elements/);
      if (match && match[1]) {
        setStats(prev => ({...prev, elementsExtracted: prev.elementsExtracted + parseInt(match[1])}));
      }
    }
    
    if (message.includes("Page size:") && message.includes("KB")) {
      const match = message.match(/Page size: ([\d.]+) KB/);
      if (match && match[1]) {
        const kb = parseFloat(match[1]);
        setStats(prev => ({...prev, bytesProcessed: prev.bytesProcessed + (kb * 1024)}));
      }
    }
    
    // Update progress when a page is successfully scraped
    if (message.startsWith("Successfully scraped")) {
      setStats(prev => {
        const newScraped = prev.scrapedPages + 1;
        const newProgress = prev.totalPages ? Math.round((newScraped / prev.totalPages) * 100) : 0;
        return {...prev, scrapedPages: newScraped, progress: newProgress};
      });
    }

    // Extract keyword match information
    if (message.includes("contains keywords:")) {
      try {
        const urlMatch = message.match(/Page (.+?) contains keywords: (.+)/);
        if (urlMatch && urlMatch.length >= 3) {
          const url = urlMatch[1];
          const keywords = urlMatch[2].split(', ');
          
          setKeywordMatches(prev => ({
            ...prev,
            [url]: keywords
          }));
        }
      } catch (error) {
        console.error("Error parsing keyword match:", error);
      }
    }
    
    // Extract keyword context information
    if (message.includes("Match context:")) {
      try {
        const contextMatch = message.match(/Match context: (.+?): (.+)/);
        if (contextMatch && contextMatch.length >= 3) {
          const keyword = contextMatch[1];
          const context = contextMatch[2];
          
          // Store context by keyword
          setKeywordContexts(prev => {
            const urlKeys = Object.keys(keywordMatches);
            const latestUrl = urlKeys.length > 0 ? urlKeys[urlKeys.length - 1] : "unknown";
            
            const urlContexts = prev[latestUrl] || {};
            return {
              ...prev,
              [latestUrl]: {
                ...urlContexts,
                [keyword]: context
              }
            };
          });
        }
      } catch (error) {
        console.error("Error parsing keyword context:", error);
      }
    }

    // Capture sample pages
    if (message.includes("Page") && message.includes(":") && !message.includes("Error") && !message.includes("warning")) {
      const match = message.match(/Page \d+: (.+)/);
      if (match && match[1]) {
        const pageUrl = match[1].trim();
        setSitemapDetails(prev => ({
          ...prev, 
          samplePages: [...prev.samplePages, pageUrl].slice(0, 10) // Keep only 10 sample pages
        }));
      }
    }
    
    // Capture sitemap errors
    if ((message.includes("Error in sitemap") || message.includes("No pages found in sitemap")) && !message.includes("chunk")) {
      setSitemapDetails(prev => ({
        ...prev,
        errors: [...prev.errors, message]
      }));
    }
  };

  const handleInterrupt = async () => {
    if (!token || interruptRequested) return;
    
    try {
      // Try to send interrupt via WebSocket first for immediate response
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({ command: "interrupt" }));
      }
      
      // Also send through HTTP for reliability
      const response = await fetch('http://localhost:8000/interrupt_extraction', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ client_id: clientId }),
      });
      
      if (response.ok) {
        setInterruptRequested(true);
        setLogs(prev => [...prev, {
          type: 'warning',
          timestamp: new Date().toISOString(),
          message: 'Interrupt requested. Extraction will stop at next safe point.'
        }]);
      } else {
        const error = await response.json();
        setError(`Failed to interrupt: ${error.detail || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Error interrupting extraction:', err);
      setError(err instanceof Error ? err.message : 'An error occurred while interrupting');
    }
  };

  const getLogIcon = (type: string) => {
    switch (type) {
      case 'error':
        return <HiExclamationCircle className="h-5 w-5 text-red-500" />;
      case 'success':
        return <HiCheckCircle className="h-5 w-5 text-green-500" />;
      case 'warning':
        return <HiExclamationCircle className="h-5 w-5 text-yellow-500" />;
      case 'detail':
        return <HiCog className="h-5 w-5 text-blue-400" />;
      case 'network':
        return <HiLightningBolt className="h-5 w-5 text-purple-500" />;
      case 'keyword':
        return <HiSearch className="h-5 w-5 text-purple-600" />;
      default:
        return <HiInformationCircle className="h-5 w-5 text-blue-500" />;
    }
  };

  const getLogTextColor = (type: string) => {
    switch (type) {
      case 'error':
        return 'text-red-700';
      case 'success':
        return 'text-green-700';
      case 'warning':
        return 'text-yellow-700';
      case 'detail':
        return 'text-blue-600';
      case 'network':
        return 'text-purple-700';
      default:
        return 'text-gray-700';
    }
  };

  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${Math.floor(seconds)}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}m ${remainingSeconds}s`;
  };

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    else if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    else return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Filter logs by type
  const standardLogs = logs.filter(log => !['detail', 'network'].includes(log.type));
  const detailLogs = logs.filter(log => log.type === 'detail');
  const networkLogs = logs.filter(log => log.type === 'network');

  // Add a new component to display keyword search results
  const renderKeywordSearchResults = () => {
    const urls = Object.keys(keywordMatches);
    if (urls.length === 0) return null;
    
    return (
      <div className="mb-4">
        <h4 className="font-medium text-gray-700 mb-2">Keyword Search Results</h4>
        <Card className="overflow-hidden">
          <div className="max-h-64 overflow-y-auto">
            {urls.map((url, idx) => (
              <div key={idx} className="border-b border-gray-100 p-3 last:border-b-0">
                <div className="flex items-center mb-2">
                  <HiSearch className="mr-2 text-purple-600" />
                  <span className="font-medium text-gray-800 truncate max-w-xs" title={url}>{url}</span>
                </div>
                <div className="pl-6 space-y-2">
                  <div className="flex flex-wrap gap-2">
                    {keywordMatches[url].map((keyword, kidx) => (
                      <span key={kidx} className="px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded-full">
                        {keyword}
                      </span>
                    ))}
                  </div>
                  {keywordContexts[url] && Object.keys(keywordContexts[url]).length > 0 && (
                    <div className="mt-1 text-xs text-gray-600 space-y-1">
                      {Object.entries(keywordContexts[url]).map(([keyword, context], cidx) => (
                        <div key={cidx}>
                          <span className="font-medium">{keyword}:</span> {context}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    );
  };

  // Add a new component to display sitemap information
  const renderSitemapInfo = () => {
    if (!sitemapDetails.found && sitemapDetails.errors.length === 0) return null;
    
    return (
      <Card className="mb-4">
        <h4 className="font-medium text-gray-700 mb-2">Sitemap Information</h4>
        {sitemapDetails.found ? (
          <>
            <div className="text-green-500 font-medium flex items-center gap-1">
              <HiCheckCircle /> Sitemap successfully processed
            </div>
            <p className="text-sm mt-1">Found {sitemapDetails.pagesCount} pages</p>
            
            {sitemapDetails.samplePages.length > 0 && (
              <div className="mt-2">
                <p className="text-xs text-gray-700 font-medium">Sample pages:</p>
                <div className="max-h-40 overflow-y-auto mt-1">
                  <ul className="text-xs text-gray-600">
                    {sitemapDetails.samplePages.map((url, idx) => (
                      <li key={idx} className="truncate mb-1">{url}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="text-red-500 font-medium flex items-center gap-1">
              <HiExclamationCircle /> Sitemap processing issues
            </div>
            
            {sitemapDetails.errors.length > 0 && (
              <div className="mt-2">
                <p className="text-xs text-gray-700 font-medium">Errors:</p>
                <div className="max-h-32 overflow-y-auto mt-1">
                  <ul className="text-xs text-red-600">
                    {sitemapDetails.errors.map((error, idx) => (
                      <li key={idx} className="mb-1">{error}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </>
        )}
      </Card>
    );
  };

  // Add a component to render keyword search summary
  const renderKeywordSearchSummary = () => {
    if (!keywordSearchStatus.performed) return null;
    
    return (
      <Card className="mb-4">
        <h4 className="font-medium text-gray-700 mb-2 flex items-center gap-2">
          <HiSearch className="text-purple-600" /> Keyword Search Summary
        </h4>
        
        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium">Search terms:</p>
            <div className="flex flex-wrap gap-1 mt-1">
              {keywordSearchStatus.termsSearched.map((term, idx) => (
                <span key={idx} className="px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded-full">
                  {term}
                </span>
              ))}
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-gray-50 p-2 rounded">
              <p className="text-xs text-gray-500">Pages Checked</p>
              <p className="font-medium">{keywordSearchStatus.pagesChecked}</p>
            </div>
            <div className="bg-gray-50 p-2 rounded">
              <p className="text-xs text-gray-500">Pages with Matches</p>
              <p className="font-medium">{keywordSearchStatus.pagesMatched}</p>
            </div>
          </div>
          
          {keywordSearchStatus.noMatchesFound && (
            <div className="bg-yellow-50 border border-yellow-200 rounded p-3 text-yellow-700 text-sm">
              <div className="flex items-center mb-1">
                <HiX className="mr-1 text-yellow-500" />
                <span className="font-medium">No matches found</span>
              </div>
              <p>None of the pages contained the specified keywords. Some pages will still be processed.</p>
            </div>
          )}
          
          {keywordSearchStatus.pagesMatched > 0 && (
            <div className="bg-green-50 border border-green-200 rounded p-3 text-green-700 text-sm">
              <div className="flex items-center mb-1">
                <HiCheckCircle className="mr-1 text-green-500" />
                <span className="font-medium">Matches found</span>
              </div>
              <p>Found {keywordSearchStatus.pagesMatched} pages containing the specified keywords.</p>
            </div>
          )}
        </div>
      </Card>
    );
  };

  return (
    <div className="mt-4">
      {/* Header with connection status */}
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-lg font-semibold">Extraction Logs</h3>
        <div className="flex items-center gap-2">
          <div className="flex items-center">
            <div className={`w-2 h-2 rounded-full mr-2 ${connected ? 'bg-green-500' : 'bg-red-500'}`}></div>
            <span className="text-sm text-gray-600">{connected ? 'Connected' : 'Disconnected'}</span>
          </div>
          <Button 
            color="failure" 
            size="xs"
            disabled={interruptRequested || !connected}
            onClick={handleInterrupt}
          >
            <HiStop className="mr-1" /> Stop
          </Button>
        </div>
      </div>

      {/* Stats Panel with Network Info */}
      <Card className="mb-4">
        <div className="flex flex-col sm:flex-row justify-between gap-4">
          <div className="grid grid-cols-2 gap-3 flex-1">
            <div>
              <p className="text-xs text-gray-500">Elapsed Time</p>
              <p className="text-lg font-semibold">{formatTime(stats.elapsed)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Pages Scraped</p>
              <p className="text-lg font-semibold">{stats.scrapedPages} <span className="text-xs text-gray-500">/ {stats.totalPages || '?'}</span></p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Elements Extracted</p>
              <p className="text-lg font-semibold">{stats.elementsExtracted}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Data Processed</p>
              <p className="text-lg font-semibold">{formatBytes(stats.bytesProcessed)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Network Speed</p>
              <p className="text-lg font-semibold">{networkStats.avgSpeed.toFixed(1)} <span className="text-xs">KB/s</span></p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Data Transferred</p>
              <p className="text-lg font-semibold">
                {networkStats.totalSize > 1024 
                  ? `${(networkStats.totalSize/1024).toFixed(2)} MB` 
                  : `${networkStats.totalSize.toFixed(1)} KB`}
              </p>
            </div>
          </div>
          
          <div>
            <p className="text-xs text-gray-500">Scraping Mode</p>
            <p className="text-sm font-medium">{parseScrapeMode(logs)}</p>
          </div>

          <div className="flex flex-col justify-center">
            <div className="flex items-center gap-2">
              <div className="w-full bg-gray-200 rounded-full h-4 relative">
                <div 
                  className="bg-blue-600 h-4 rounded-full transition-all duration-500" 
                  style={{ width: `${stats.progress}%` }}
                ></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-xs font-medium text-white">{stats.progress}%</span>
                </div>
              </div>
            </div>
            <p className="text-xs text-center mt-1 text-gray-500">
              {interruptRequested ? 'Stopping...' : 'Extraction Progress'}
            </p>
          </div>
        </div>
      </Card>

      {/* Keyword Search Summary Panel */}
      {keywordSearchStatus.performed && renderKeywordSearchSummary()}

      {/* Sitemap Information Panel */}
      {(sitemapDetails.found || sitemapDetails.errors.length > 0) && renderSitemapInfo()}

      {/* Keyword Search Results Panel */}
      {Object.keys(keywordMatches).length > 0 && renderKeywordSearchResults()}

      {error && (
        <Alert color="failure" className="mb-4">
          {error}
        </Alert>
      )}

      {/* Tabbed Log View */}
      <Tabs aria-label="Log tabs" style={{ textDecoration: 'underline' }} onActiveTabChange={(tab) => setActiveTab(['main', 'network', 'technical', 'keywords'][tab])}>
        <TabItem title="Main Logs" active={activeTab === 'main'}>
          <Card className="overflow-hidden">
            <div className="h-64 overflow-y-auto p-2 bg-gray-50 rounded border">
              {standardLogs.length === 0 ? (
                <div className="flex items-center justify-center h-full text-gray-500">
                  <Spinner size="sm" className="mr-2" /> Waiting for extraction data...
                </div>
              ) : (
                <div className="space-y-2">
                  {standardLogs.map((log, index) => (
                    <div 
                      key={index} 
                      className="flex items-start p-2 rounded bg-white border"
                    >
                      {getLogIcon(log.type)}
                      <div className="ml-2 flex-1">
                        <div className="flex justify-between items-start">
                          <Badge color={
                            log.type === 'error' ? 'failure' : 
                            log.type === 'success' ? 'success' : 
                            log.type === 'warning' ? 'warning' : 'info'
                          } className="mb-1">
                            {log.type}
                          </Badge>
                          <span className="text-xs text-gray-500">
                            {new Date(log.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className={`${getLogTextColor(log.type)} text-sm`}>
                          {log.message}
                        </p>
                      </div>
                    </div>
                  ))}
                  <div ref={logsEndRef} />
                </div>
              )}
            </div>
          </Card>
        </TabItem>
        
        <TabItem title="Network" active={activeTab === 'network'}>
          <Card className="overflow-hidden">
            <div className="h-64 overflow-y-auto p-2 bg-gray-50 rounded border">
              {networkLogs.length === 0 ? (
                <div className="flex items-center justify-center h-full text-gray-500">
                  <p>No network data available yet</p>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="grid grid-cols-12 gap-2 p-2 bg-gray-100 text-xs font-semibold">
                    <div className="col-span-4">URL</div>
                    <div className="col-span-2">Time</div>
                    <div className="col-span-2">Size</div>
                    <div className="col-span-2">Speed</div>
                    <div className="col-span-2">Status</div>
                  </div>
                  {networkLogs.map((log, index) => {
                    // Parse the network log message to extract components
                    const timeMatch = log.message.match(/loaded in (\d+)ms/);
                    const sizeMatch = log.message.match(/Size: ([\d.]+)KB/);
                    const speedMatch = log.message.match(/Speed: ([\d.]+)KB\/s/);
                    const statusMatch = log.message.match(/Status: (\d+|unknown)/);
                    const urlMatch = log.message.match(/page \d+\/\d+: ([^ ]+)/);
                    
                    const time = timeMatch ? timeMatch[1] + "ms" : "N/A";
                    const size = sizeMatch ? sizeMatch[1] + "KB" : "N/A";
                    const speed = speedMatch ? speedMatch[1] + "KB/s" : "N/A";
                    const status = statusMatch ? statusMatch[1] : "200";
                    const url = urlMatch ? urlMatch[1] : "Unknown URL";
                    
                    return (
                      <div 
                        key={index} 
                        className={`grid grid-cols-12 gap-2 p-2 text-xs ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}
                      >
                        <div className="col-span-4 truncate">{url}</div>
                        <div className="col-span-2">{time}</div>
                        <div className="col-span-2">{size}</div>
                        <div className="col-span-2">{speed}</div>
                        <div className={`col-span-2 ${
                          status === "200" ? "text-green-600" : "text-red-600"
                        }`}>
                          {status}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </Card>
        </TabItem>
        
        <TabItem title="Technical Details" active={activeTab === 'technical'}>
          <Card className="overflow-hidden">
            <div className="h-64 overflow-y-auto p-2 bg-gray-50 rounded border">
              {detailLogs.length === 0 ? (
                <div className="flex items-center justify-center h-full text-gray-500">
                  <p>No technical details available yet</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {detailLogs.map((log, index) => (
                    <div key={index} className="p-1.5 text-xs border-b border-gray-100">
                      <span className="text-gray-500 mr-2">{new Date(log.timestamp).toLocaleTimeString()}</span>
                      <span className="text-blue-600">{log.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </TabItem>

        <TabItem title="Keywords" icon={HiSearch} active={activeTab === 'keywords'}>
          <Card className="overflow-hidden">
            <div className="h-64 overflow-y-auto p-2 bg-gray-50 rounded border">
              {Object.keys(keywordMatches).length === 0 ? (
                <div className="flex items-center justify-center h-full text-gray-500">
                  <p>No keyword matches found yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {Object.entries(keywordMatches).map(([url, keywords], idx) => (
                    <div key={idx} className="p-3 bg-white rounded border">
                      <p className="font-medium text-gray-700 truncate" title={url}>{url}</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {keywords.map((keyword, kidx) => (
                          <span key={kidx} className="px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded-full">
                            {keyword}
                          </span>
                        ))}
                      </div>
                      {keywordContexts[url] && (
                        <div className="mt-2 text-xs text-gray-600 border-t border-gray-100 pt-2">
                          <p className="font-medium">Context:</p>
                          {Object.entries(keywordContexts[url]).map(([kw, context], cidx) => (
                            <div key={cidx} className="mt-1">
                              <span className="font-medium">{kw}:</span> {context}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </TabItem>
      </Tabs>
    </div>
  );
}
