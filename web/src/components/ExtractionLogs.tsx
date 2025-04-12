import { useEffect, useState, useRef } from "react";
import { Card, Badge, Alert, Button, Spinner } from "flowbite-react";
import { HiInformationCircle, HiCheckCircle, HiExclamationCircle, HiX, HiPaperClip, HiChevronDown, HiChevronRight, HiStop, HiRefresh } from "react-icons/hi";
import Cookies from 'js-cookie';

interface LogEntry {
  type: string;
  message: string;
  timestamp: string;
  details?: any;
}

interface ExtractionLogsProps {
  clientId: string | null;
  onComplete?: (data: any) => void;
}

export default function ExtractionLogs({ clientId, onComplete }: ExtractionLogsProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [showDetails, setShowDetails] = useState<Record<number, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const logsEndRef = useRef<null | HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [interrupting, setInterrupting] = useState(false);
  const [isBackgroundRunning, setIsBackgroundRunning] = useState(false);
  const [extractionStatus, setExtractionStatus] = useState<any>(null);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [redirectCountdown, setRedirectCountdown] = useState<number | null>(null);
  const reconnectAttempts = useRef(0);

  // Toggle log detail visibility
  const toggleDetails = (index: number) => {
    setShowDetails(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  // Format timestamp to local time
  const formatTimestamp = (isoTimestamp: string) => {
    try {
      return new Date(isoTimestamp).toLocaleTimeString();
    } catch (e) {
      return "Unknown time";
    }
  };

  // Get badge color based on log type
  const getBadgeColor = (type: string) => {
    switch(type) {
      case 'success': return 'success';
      case 'error': return 'failure';
      case 'warning': return 'warning';
      case 'info': return 'info';
      case 'detail': return 'indigo';
      default: return 'gray';
    }
  };

  // Get icon based on log type
  const getLogIcon = (type: string) => {
    switch(type) {
      case 'success': return <HiCheckCircle className="w-5 h-5" />;
      case 'error': return <HiExclamationCircle className="w-5 h-5" />;
      case 'warning': return <HiExclamationCircle className="w-5 h-5" />;
      case 'info': return <HiInformationCircle className="w-5 h-5" />;
      case 'detail': return <HiPaperClip className="w-5 h-5" />;
      default: return <HiInformationCircle className="w-5 h-5" />;
    }
  };

  // Add interrupt extraction function
  const handleExtractionInterrupt = async () => {
    if (!clientId) return;
    
    try {
      setInterrupting(true);
      const token = Cookies.get('token');
      
      if (!token) {
        throw new Error("Authentication token not found");
      }
      
      const response = await fetch('http://localhost:8000/interrupt_extraction', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ client_id: clientId }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Failed to interrupt extraction");
      }
      
      // Add local log entries about the interruption
      setLogs(prev => [
        ...prev, 
        {
          type: 'warning',
          message: 'Interruption requested. The process will stop at the next safe point.',
          timestamp: new Date().toISOString()
        },
        {
          type: 'info',
          message: 'Data collected up to this point will be available in the project details.',
          timestamp: new Date().toISOString()
        },
        {
          type: 'info',
          message: 'You will be redirected to project details when the interruption is complete.',
          timestamp: new Date().toISOString()
        }
      ]);
      
      // Fetch status to see if extraction is now interrupted
      setTimeout(fetchExtractionStatus, 2000);
      
    } catch (err) {
      setError(`Failed to interrupt: ${err instanceof Error ? err.message : 'Unknown error'}`);
      console.error('Error interrupting extraction:', err);
    } finally {
      setInterrupting(false);
    }
  };

  // Add function to fetch extraction status
  const fetchExtractionStatus = async () => {
    if (!clientId) return;
    
    try {
      const token = Cookies.get('token');
      if (!token) return;
      
      const response = await fetch(`http://localhost:8000/extraction_status/${clientId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const status = await response.json();
        setExtractionStatus(status);
        
        // Set background running state based on status
        const isRunning = status.status === "running";
        setIsBackgroundRunning(isRunning);
        
        // If extraction is complete OR interrupted, trigger completion callback
        if (status.status === "completed" || status.status === "interrupted" || status.status === "error") {
          if (onComplete && status.project_id) {
            // Start countdown for redirect
            setRedirectCountdown(5);
            
            // Add appropriate message based on status
            setLogs(prev => [
              ...prev,
              {
                type: status.status === "interrupted" ? 'warning' : 'success',
                message: status.status === "interrupted" 
                  ? `Extraction was interrupted. ${status.stats?.pages_successful || 0} pages were successfully extracted.`
                  : `Extraction completed successfully with ${status.stats?.pages_successful || 0} pages extracted.`,
                timestamp: new Date().toISOString()
              }
            ]);
            
            const countdownInterval = setInterval(() => {
              setRedirectCountdown(prev => {
                if (prev === 1) {
                  clearInterval(countdownInterval);
                  // Call onComplete with project data
                  onComplete({
                    project_id: status.project_id,
                    processing_status: {
                      extraction_status: status.status,
                      pages_found: status.stats?.pages_attempted || 0,
                      pages_scraped: status.stats?.pages_successful || 0
                    }
                  });
                  return null;
                }
                return prev ? prev - 1 : null;
              });
            }, 1000);
          }
        }
      }
    } catch (err) {
      console.error("Error fetching extraction status:", err);
    }
  };

  // Scroll to bottom when logs update, if auto-scroll is enabled
  useEffect(() => {
    if (autoScroll) {
      logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, autoScroll]);

  // Enhanced WebSocket connection with better reconnection logic
  useEffect(() => {
    if (!clientId) return;

    const connectWebSocket = () => {
      try {
        const wsUrl = `ws://localhost:8000/ws/${clientId}`;
        console.log(`Connecting to WebSocket at: ${wsUrl}`);
        
        const socket = new WebSocket(wsUrl);
        socketRef.current = socket;

        socket.onopen = () => {
          console.log('WebSocket connection established');
          setIsConnected(true);
          reconnectAttempts.current = 0; // Reset reconnect attempts on successful connection
          setLogs(prev => [...prev, {
            type: 'success',
            message: 'Connected to server. Receiving live extraction logs.',
            timestamp: new Date().toISOString()
          }]);
        };

        socket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log('WebSocket message received:', data);
            
            // Handle different types of messages
            if (data.type === 'completion') {
              // Extraction completed
              try {
                const completionData = JSON.parse(data.message);
                if (onComplete) {
                  onComplete(completionData);
                }
              } catch (err) {
                console.error('Error parsing completion data:', err);
              }
            } else {
              // Regular log message - add to logs
              setLogs(prev => [...prev, {
                type: data.type || 'info',
                message: data.message,
                timestamp: data.timestamp,
                details: data.details
              }]);
            }
          } catch (err) {
            console.error('Error processing WebSocket message:', err);
          }
        };

        socket.onclose = (event) => {
          console.log('WebSocket connection closed:', event);
          setIsConnected(false);
          
          // If not a clean close, try to reconnect
          if (!event.wasClean) {
            setError(`Connection lost. Attempting to reconnect... (${reconnectAttempts.current + 1})`);
            
            // Increment reconnection attempt counter
            reconnectAttempts.current += 1;
            
            // Add a message about background processing continuing
            setLogs(prev => [...prev, {
              type: 'info',
              message: 'Connection to server lost. Extraction continues in the background.',
              timestamp: new Date().toISOString()
            }]);
            
            // Fetch status to see if extraction is still running
            fetchExtractionStatus();
            
            // Try to reconnect with exponential backoff
            const backoffTime = Math.min(2000 * Math.pow(2, reconnectAttempts.current), 30000);
            
            reconnectTimerRef.current = setTimeout(() => {
              if (socketRef.current?.readyState !== WebSocket.OPEN) {
                connectWebSocket();
              }
            }, backoffTime);
          } else {
            // If clean close, check if extraction is complete
            fetchExtractionStatus();
          }
        };

        socket.onerror = (error) => {
          console.error('WebSocket error:', error);
          setError('WebSocket connection error');
        };

        return socket;
      } catch (err) {
        console.error('Error creating WebSocket:', err);
        setError('Failed to connect to server');
        return null;
      }
    };

    const socket = connectWebSocket();
    
    // Set up periodic status checks (every 5 seconds)
    const statusInterval = setInterval(fetchExtractionStatus, 5000);

    return () => {
      // Clean up WebSocket
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        console.log('Closing WebSocket connection');
        socketRef.current.close();
      }
      
      // Clear reconnection timer if it exists
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      
      // Clear status interval
      clearInterval(statusInterval);
    };
  }, [clientId, onComplete]);

  // Count logs by type
  const logCounts = logs.reduce((acc, log) => {
    acc[log.type] = (acc[log.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <Card className="overflow-hidden">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-bold">Extraction Logs</h3>
        <div className="flex items-center gap-2">
          {isBackgroundRunning && !isConnected && (
            <Badge color="purple" className="mr-2 animate-pulse">
              Running in background
            </Badge>
          )}
          <Badge color={isConnected ? "success" : "gray"} className="mr-2">
            {isConnected ? "Connected" : "Disconnected"}
          </Badge>
          <Button 
            size="xs" 
            color="light" 
            onClick={() => setAutoScroll(!autoScroll)}
          >
            {autoScroll ? "Disable Auto-scroll" : "Enable Auto-scroll"}
          </Button>
          
          {/* Add refresh button */}
          <Button
            size="xs"
            color="light"
            onClick={fetchExtractionStatus}
            title="Refresh status"
          >
            <HiRefresh className="w-4 h-4" />
          </Button>
          
          {(isConnected || isBackgroundRunning) && (
            <Button
              size="xs"
              color="failure"
              onClick={handleExtractionInterrupt}
              disabled={interrupting}
              className="flex items-center"
            >
              <HiStop className="mr-1" />
              {interrupting ? "Interrupting..." : "Interrupt Extraction"}
            </Button>
          )}
        </div>
      </div>

      {error && (
        <Alert color="failure" className="mb-4">
          <div className="flex items-center gap-2">
            <HiExclamationCircle className="h-5 w-5" />
            <span>{error}</span>
          </div>
        </Alert>
      )}

      {redirectCountdown !== null && (
        <Alert color="info" className="mb-4">
          <div className="flex items-center">
            <Spinner size="sm" className="mr-2" />
            <span>Redirecting to project details in {redirectCountdown} seconds...</span>
          </div>
        </Alert>
      )}
      
      {extractionStatus && (
        <div className="bg-blue-50 p-3 rounded-lg mb-4 text-sm">
          <h4 className="font-medium text-blue-700 mb-2">Extraction Status</h4>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="font-medium">Status:</span> 
              <Badge 
                color={
                  extractionStatus.status === "running" ? "info" :
                  extractionStatus.status === "completed" ? "success" :
                  extractionStatus.status === "interrupted" ? "warning" : "failure"
                }
                className="ml-2"
              >
                {extractionStatus.status}
              </Badge>
            </div>
            {extractionStatus.stats && (
              <>
                <div><span className="font-medium">Pages attempted:</span> {extractionStatus.stats.pages_attempted || 0}</div>
                <div><span className="font-medium">Pages successful:</span> {extractionStatus.stats.pages_successful || 0}</div>
                <div><span className="font-medium">Started:</span> {new Date(extractionStatus.stats.start_time).toLocaleTimeString()}</div>
              </>
            )}
          </div>
        </div>
      )}

      <div className="flex gap-2 flex-wrap mb-4">
        {Object.entries(logCounts).map(([type, count]) => (
          <Badge key={type} color={getBadgeColor(type)}>
            {type}: {count}
          </Badge>
        ))}
      </div>

      <div className="bg-gray-50 rounded-lg border border-gray-200 p-2 max-h-96 overflow-y-auto">
        {logs.length === 0 ? (
          <div className="text-center text-gray-500 py-4">
            Waiting for logs...
          </div>
        ) : (
          <div className="space-y-2">
            {logs.map((log, index) => (
              <div key={index} className={`p-2 rounded-lg ${
                log.type === 'error' ? 'bg-red-50 border border-red-200' :
                log.type === 'warning' ? 'bg-yellow-50 border border-yellow-200' :
                log.type === 'success' ? 'bg-green-50 border border-green-200' :
                log.type === 'detail' ? 'bg-indigo-50 border border-indigo-200' :
                'bg-white border border-gray-200'
              }`}>
                <div className="flex items-start">
                  <div className={`mr-2 ${
                    log.type === 'error' ? 'text-red-500' :
                    log.type === 'warning' ? 'text-yellow-500' :
                    log.type === 'success' ? 'text-green-500' :
                    log.type === 'detail' ? 'text-indigo-500' :
                    'text-blue-500'
                  }`}>
                    {getLogIcon(log.type)}
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between items-start">
                      <p className={`text-sm ${
                        log.type === 'error' ? 'text-red-600' :
                        log.type === 'warning' ? 'text-yellow-600' :
                        log.type === 'success' ? 'text-green-600' :
                        log.type === 'detail' ? 'text-indigo-600' :
                        'text-gray-600'
                      }`}>
                        {log.message}
                      </p>
                      <span className="text-xs text-gray-500 ml-2 whitespace-nowrap">
                        {formatTimestamp(log.timestamp)}
                      </span>
                    </div>
                    
                    {log.details && (
                      <div>
                        <button 
                          onClick={() => toggleDetails(index)}
                          className="text-xs flex items-center text-gray-600 hover:underline mt-1"
                        >
                          {showDetails[index] ? (
                            <>
                              <HiChevronDown className="mr-1" />
                              Hide details
                            </>
                          ) : (
                            <>
                              <HiChevronRight className="mr-1" />
                              Show details
                            </>
                          )}
                        </button>
                        
                        {showDetails[index] && (
                          <div className="mt-2 p-2 bg-white rounded border border-gray-200 text-xs">
                            <pre className="whitespace-pre-wrap break-words">
                              {JSON.stringify(log.details, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        )}
      </div>
    </Card>
  );
}
