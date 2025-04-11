import { Card, Table, Accordion } from 'flowbite-react';
import { HiClock, HiDownload, HiServer, HiGlobeAlt } from 'react-icons/hi';

interface NetworkStats {
  request_time_ms: number;
  ttfb_ms: number;
  download_time_ms: number;
  processing_time_ms: number;
  total_time_ms: number;
  content_size_bytes: number;
  status_code: number;
  ip_address: string | null;
  headers: Record<string, string>;
  server_details: string | null;
  content_type: string | null;
  dns_time_ms?: number;
}

interface NetworkPerformancePanelProps {
  pageUrl: string;
  networkStats: NetworkStats;
}

export default function NetworkPerformancePanel({ pageUrl, networkStats }: NetworkPerformancePanelProps) {
  // Format milliseconds to a readable format with appropriate precision
  const formatTime = (ms: number): string => {
    if (ms < 1) return "<1 ms";
    if (ms < 1000) return `${Math.round(ms)} ms`;
    return `${(ms / 1000).toFixed(2)} s`;
  };

  // Format bytes to KB, MB etc.
  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  // Helper to determine speed rating
  const getSpeedRating = (totalTime: number): { label: string; color: string } => {
    if (totalTime < 500) return { label: "Very Fast", color: "text-green-600" };
    if (totalTime < 1000) return { label: "Fast", color: "text-green-500" };
    if (totalTime < 2000) return { label: "Good", color: "text-blue-500" };
    if (totalTime < 5000) return { label: "Average", color: "text-yellow-500" };
    return { label: "Slow", color: "text-red-500" };
  };

  const speedRating = getSpeedRating(networkStats.total_time_ms);

  return (
    <Card>
      <div className="flex flex-col md:flex-row justify-between items-start gap-4">
        <div>
          <h3 className="font-bold text-lg mb-1">Network Performance</h3>
          <p className="text-gray-600 text-sm truncate max-w-md">{pageUrl}</p>
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Speed Rating:</span>
          <span className={`font-bold ${speedRating.color}`}>{speedRating.label}</span>
        </div>
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 my-4">
        <div className="bg-gray-50 p-3 rounded-lg border">
          <div className="flex items-center mb-1">
            <HiClock className="text-blue-500 mr-2" />
            <span className="text-sm text-gray-600">Total Time</span>
          </div>
          <p className="text-xl font-bold">{formatTime(networkStats.total_time_ms)}</p>
        </div>
        
        <div className="bg-gray-50 p-3 rounded-lg border">
          <div className="flex items-center mb-1">
            <HiDownload className="text-green-500 mr-2" />
            <span className="text-sm text-gray-600">Page Size</span>
          </div>
          <p className="text-xl font-bold">{formatSize(networkStats.content_size_bytes)}</p>
        </div>
        
        <div className="bg-gray-50 p-3 rounded-lg border">
          <div className="flex items-center mb-1">
            <HiServer className="text-purple-500 mr-2" />
            <span className="text-sm text-gray-600">Status</span>
          </div>
          <p className="text-xl font-bold">{networkStats.status_code}</p>
        </div>
        
        <div className="bg-gray-50 p-3 rounded-lg border">
          <div className="flex items-center mb-1">
            <HiGlobeAlt className="text-indigo-500 mr-2" />
            <span className="text-sm text-gray-600">Server</span>
          </div>
          <p className="text-xl font-bold truncate">{networkStats.server_details || "Unknown"}</p>
        </div>
      </div>
      
      <Accordion>
        <Accordion.Panel>
          <Accordion.Title>
            Detailed Performance Metrics
          </Accordion.Title>
          <Accordion.Content>
            <Table>
              <Table.Body className="divide-y">
                <Table.Row className="bg-white">
                  <Table.Cell className="font-medium">DNS Lookup</Table.Cell>
                  <Table.Cell>{formatTime(networkStats.dns_time_ms || 0)}</Table.Cell>
                </Table.Row>
                <Table.Row className="bg-white">
                  <Table.Cell className="font-medium">Time to First Byte (TTFB)</Table.Cell>
                  <Table.Cell>{formatTime(networkStats.ttfb_ms)}</Table.Cell>
                </Table.Row>
                <Table.Row className="bg-white">
                  <Table.Cell className="font-medium">Content Download</Table.Cell>
                  <Table.Cell>{formatTime(networkStats.download_time_ms)}</Table.Cell>
                </Table.Row>
                <Table.Row className="bg-white">
                  <Table.Cell className="font-medium">Content Processing</Table.Cell>
                  <Table.Cell>{formatTime(networkStats.processing_time_ms)}</Table.Cell>
                </Table.Row>
                <Table.Row className="bg-white">
                  <Table.Cell className="font-medium">Total Request Time</Table.Cell>
                  <Table.Cell>{formatTime(networkStats.request_time_ms)}</Table.Cell>
                </Table.Row>
                <Table.Row className="bg-white">
                  <Table.Cell className="font-medium">IP Address</Table.Cell>
                  <Table.Cell>{networkStats.ip_address || "Unknown"}</Table.Cell>
                </Table.Row>
                <Table.Row className="bg-white">
                  <Table.Cell className="font-medium">Content Type</Table.Cell>
                  <Table.Cell>{networkStats.content_type || "Unknown"}</Table.Cell>
                </Table.Row>
              </Table.Body>
            </Table>
            
            <div className="mt-4">
              <h4 className="font-medium text-sm mb-2">Performance Timeline</h4>
              <div className="relative h-8 bg-gray-100 rounded-full overflow-hidden">
                {/* DNS Lookup */}
                <div 
                  className="absolute h-8 bg-yellow-300" 
                  style={{ 
                    width: `${(networkStats.dns_time_ms || 0) / networkStats.total_time_ms * 100}%` 
                  }}
                ></div>
                
                {/* TTFB (measured from after DNS) */}
                <div 
                  className="absolute h-8 bg-blue-400" 
                  style={{ 
                    left: `${(networkStats.dns_time_ms || 0) / networkStats.total_time_ms * 100}%`,
                    width: `${networkStats.ttfb_ms / networkStats.total_time_ms * 100}%` 
                  }}
                ></div>
                
                {/* Download Time */}
                <div 
                  className="absolute h-8 bg-green-400" 
                  style={{ 
                    left: `${((networkStats.dns_time_ms || 0) + networkStats.ttfb_ms) / networkStats.total_time_ms * 100}%`,
                    width: `${networkStats.download_time_ms / networkStats.total_time_ms * 100}%` 
                  }}
                ></div>
                
                {/* Processing Time */}
                <div 
                  className="absolute h-8 bg-purple-400" 
                  style={{ 
                    left: `${((networkStats.dns_time_ms || 0) + networkStats.ttfb_ms + networkStats.download_time_ms) / networkStats.total_time_ms * 100}%`,
                    width: `${networkStats.processing_time_ms / networkStats.total_time_ms * 100}%` 
                  }}
                ></div>
              </div>
              
              <div className="flex justify-between mt-1 text-xs">
                <span>0 ms</span>
                <span>{formatTime(networkStats.total_time_ms)}</span>
              </div>
              
              <div className="flex flex-wrap gap-3 mt-2">
                <div className="flex items-center">
                  <span className="w-3 h-3 bg-yellow-300 rounded-full mr-1"></span>
                  <span className="text-xs">DNS</span>
                </div>
                <div className="flex items-center">
                  <span className="w-3 h-3 bg-blue-400 rounded-full mr-1"></span>
                  <span className="text-xs">TTFB</span>
                </div>
                <div className="flex items-center">
                  <span className="w-3 h-3 bg-green-400 rounded-full mr-1"></span>
                  <span className="text-xs">Download</span>
                </div>
                <div className="flex items-center">
                  <span className="w-3 h-3 bg-purple-400 rounded-full mr-1"></span>
                  <span className="text-xs">Processing</span>
                </div>
              </div>
            </div>
          </Accordion.Content>
        </Accordion.Panel>
      </Accordion>
    </Card>
  );
}
