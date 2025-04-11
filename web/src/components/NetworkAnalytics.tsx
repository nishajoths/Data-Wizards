import { Card, Table, TableBody, TableCell, TableRow } from 'flowbite-react';
import { HiLightningBolt, HiClock, HiServer } from 'react-icons/hi';

interface NetworkStats {
  total_size_bytes: number;
  total_duration_ms: number;
  pages_with_metrics: number;
  avg_speed_kbps: number;
  fastest_page: { url: string | null; speed_kbps: number };
  slowest_page: { url: string | null; speed_kbps: number };
  total_requests: number;
}

interface NetworkAnalyticsProps {
  networkStats: NetworkStats | undefined;
  className?: string;
}

const formatSpeed = (kbps: number): string => {
  if (kbps > 1024) {
    return `${(kbps / 1024).toFixed(2)} MB/s`;
  }
  return `${kbps.toFixed(2)} KB/s`;
};

const formatSize = (bytes: number): string => {
  if (bytes > 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  if (bytes > 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`;
  }
  return `${bytes} bytes`;
};

const formatTime = (ms: number): string => {
  if (ms > 1000) {
    return `${(ms / 1000).toFixed(2)} s`;
  }
  return `${ms} ms`;
};

export default function NetworkAnalytics({ networkStats, className = '' }: NetworkAnalyticsProps) {
  if (!networkStats) {
    return (
      <Card className={className}>
        <div className="text-center text-gray-500 py-4">
          <HiServer className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-lg font-medium">No Network Data Available</h3>
        </div>
      </Card>
    );
  }

  const {
    total_size_bytes,
    total_duration_ms,
    pages_with_metrics,
    avg_speed_kbps,
    fastest_page,
    slowest_page,
    total_requests
  } = networkStats;

  return (
    <Card className={className}>
      <h3 className="text-lg font-bold mb-4 flex items-center">
        <HiLightningBolt className="mr-2 text-blue-600" />
        Network Performance Analysis
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-blue-50 p-4 rounded-lg text-center">
          <HiLightningBolt className="mx-auto h-8 w-8 text-blue-600" />
          <p className="text-sm font-semibold text-gray-600 mt-1">Average Speed</p>
          <p className="text-xl font-bold text-blue-700">{formatSpeed(avg_speed_kbps)}</p>
        </div>

        <div className="bg-green-50 p-4 rounded-lg text-center">
          <HiServer className="mx-auto h-8 w-8 text-green-600" />
          <p className="text-sm font-semibold text-gray-600 mt-1">Data Transferred</p>
          <p className="text-xl font-bold text-green-700">{formatSize(total_size_bytes)}</p>
        </div>

        <div className="bg-purple-50 p-4 rounded-lg text-center">
          <HiClock className="mx-auto h-8 w-8 text-purple-600" />
          <p className="text-sm font-semibold text-gray-600 mt-1">Total Load Time</p>
          <p className="text-xl font-bold text-purple-700">{formatTime(total_duration_ms)}</p>
        </div>
      </div>

      <div className="mb-6">
        <h4 className="font-semibold text-gray-700 mb-2">Performance Extremes</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border rounded-lg p-3">
            <h5 className="text-sm font-semibold text-green-700 mb-1">Fastest Page</h5>
            {fastest_page.url ? (
              <>
                <p className="text-xs text-gray-600 truncate">{fastest_page.url}</p>
                <p className="text-sm font-bold">{formatSpeed(fastest_page.speed_kbps)}</p>
              </>
            ) : (
              <p className="text-xs text-gray-500 italic">No data</p>
            )}
          </div>
          
          <div className="border rounded-lg p-3">
            <h5 className="text-sm font-semibold text-red-700 mb-1">Slowest Page</h5>
            {slowest_page.url ? (
              <>
                <p className="text-xs text-gray-600 truncate">{slowest_page.url}</p>
                <p className="text-sm font-bold">{formatSpeed(slowest_page.speed_kbps)}</p>
              </>
            ) : (
              <p className="text-xs text-gray-500 italic">No data</p>
            )}
          </div>
        </div>
      </div>

      <div>
        <h4 className="font-semibold text-gray-700 mb-2">Summary</h4>
        <Table>
          <TableBody>
            <TableRow>
              <TableCell className="font-medium">Total Requests</TableCell>
              <TableCell>{total_requests}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">Pages With Metrics</TableCell>
              <TableCell>{pages_with_metrics}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">Avg. Page Size</TableCell>
              <TableCell>
                {pages_with_metrics ? formatSize(total_size_bytes / pages_with_metrics) : "N/A"}
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">Avg. Load Time</TableCell>
              <TableCell>
                {pages_with_metrics ? formatTime(total_duration_ms / pages_with_metrics) : "N/A"}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
