import { useEffect, useState, useRef } from "react";
import { Card, Badge, Alert, Button } from "flowbite-react";
import { HiInformationCircle, HiCheckCircle, HiExclamationCircle, HiX, HiPaperClip, HiChevronDown, HiChevronRight } from "react-icons/hi";

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

  // Scroll to bottom when logs update, if auto-scroll is enabled
  useEffect(() => {
    if (autoScroll) {
      logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, autoScroll]);

  // Set up WebSocket connection
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
          setLogs(prev => [...prev, {
            type: 'info',
            message: 'Connected to server. Waiting for extraction logs...',
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
          
          if (!event.wasClean) {
            setError(`Connection closed unexpectedly (code: ${event.code})`);
            // Try to reconnect after a delay
            setTimeout(() => {
              if (socketRef.current?.readyState !== WebSocket.OPEN) {
                connectWebSocket();
              }
            }, 3000);
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

    return () => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        console.log('Closing WebSocket connection');
        socket.close();
      }
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
        <div className="flex items-center">
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
                    
                    {/* For logs with details, add expand/collapse button */}
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
