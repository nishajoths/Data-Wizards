import { Card, Tabs, TabItem, Badge, Accordion, AccordionPanel, AccordionTitle, AccordionContent } from 'flowbite-react';
import { useState } from 'react';
import { HiInformationCircle, HiGlobeAlt, HiHashtag, HiCode } from 'react-icons/hi';

interface MetadataViewerProps {
  metadata: any;
  url?: string;
}

export default function MetadataViewer({ metadata, url }: MetadataViewerProps) {
  const [activeTab, setActiveTab] = useState<string>('basic');
  
  if (!metadata) {
    return (
      <Card>
        <div className="text-center text-gray-500">
          <HiInformationCircle className="mx-auto h-8 w-8" />
          <p className="mt-2">No metadata available for this page</p>
        </div>
      </Card>
    );
  }
  
  // Function to render key-value pairs
  const renderKeyValuePairs = (data: any, parentKey: string = '') => {
    if (!data || typeof data !== 'object') return null;
    
    return Object.entries(data).map(([key, value], index) => {
      const fullKey = parentKey ? `${parentKey}.${key}` : key;
      
      // Skip rendering if value is object or array (will be handled separately)
      if (value !== null && typeof value === 'object') {
        return null;
      }
      
      return (
        <div key={fullKey} className="py-2 border-b border-gray-100 last:border-0">
          <div className="flex justify-between">
            <span className="font-medium text-gray-700">{key}</span>
            <Badge color="light" className="ml-2">
              {typeof value}
            </Badge>
          </div>
          <div className="mt-1 break-all">
            {typeof value === 'string' && (
              value.startsWith('http') ? (
                <a 
                  href={value} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline break-all flex items-center"
                >
                  {value}
                  <HiGlobeAlt className="ml-1 h-3 w-3" />
                </a>
              ) : (
                <span className="text-gray-600">{value}</span>
              )
            )}
            {typeof value !== 'string' && (
              <span className="text-gray-600">{String(value)}</span>
            )}
          </div>
        </div>
      );
    }).filter(Boolean);
  };
  
  // Extract sections from metadata
  const basicMetadata = metadata.basic || {};
  const openGraph = metadata.open_graph || {};
  const twitter = metadata.twitter || {};
  const structuredData = metadata.structured_data || [];
  
  return (
    <Card>
      <div className="mb-4">
        <h3 className="text-lg font-semibold flex items-center">
          <HiInformationCircle className="mr-2 text-blue-500" />
          Metadata for {url || metadata.url || "Page"}
        </h3>
        {metadata.extracted_at && (
          <p className="text-xs text-gray-500 mt-1">
            Extracted at: {new Date(metadata.extracted_at).toLocaleString()}
          </p>
        )}
      </div>
      
      <Tabs aria-label="Metadata tabs" className="underline" onActiveTabChange={(tab) => setActiveTab(tab === 0 ? 'basic' : tab === 1 ? 'og' : tab === 2 ? 'twitter' : 'structured')}>
        <TabItem title="Basic Metadata" icon={HiInformationCircle} active={activeTab === 'basic'}>
          <div className="p-2 max-h-96 overflow-y-auto">
            {Object.keys(basicMetadata).length > 0 ? (
              renderKeyValuePairs(basicMetadata)
            ) : (
              <div className="text-center text-gray-500 py-4">
                <p>No basic metadata available</p>
              </div>
            )}
          </div>
        </TabItem>
        
        <TabItem title="Open Graph" icon={HiGlobeAlt} active={activeTab === 'og'}>
          <div className="p-2 max-h-96 overflow-y-auto">
            {Object.keys(openGraph).length > 0 ? (
              renderKeyValuePairs(openGraph)
            ) : (
              <div className="text-center text-gray-500 py-4">
                <p>No Open Graph metadata available</p>
              </div>
            )}
          </div>
        </TabItem>
        
        <TabItem title="Twitter Card" icon={HiHashtag} active={activeTab === 'twitter'}>
          <div className="p-2 max-h-96 overflow-y-auto">
            {Object.keys(twitter).length > 0 ? (
              renderKeyValuePairs(twitter)
            ) : (
              <div className="text-center text-gray-500 py-4">
                <p>No Twitter Card metadata available</p>
              </div>
            )}
          </div>
        </TabItem>
        
        <TabItem title="Structured Data" icon={HiCode} active={activeTab === 'structured'}>
          <div className="p-2 max-h-96 overflow-y-auto">
            {structuredData.length > 0 ? (
              <Accordion>
                {structuredData.map((data: any, index: number) => {
                  const type = data['@type'] || data['@context'] || `Item ${index+1}`;
                  return (
                    <AccordionPanel key={index}>
                      <AccordionTitle>
                        {typeof type === 'string' ? type : `Structured Data Item ${index+1}`}
                      </AccordionTitle>
                      <AccordionContent>
                        <div className="bg-gray-50 p-3 rounded overflow-auto">
                          <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(data, null, 2)}</pre>
                        </div>
                      </AccordionContent>
                    </AccordionPanel>
                  );
                })}
              </Accordion>
            ) : (
              <div className="text-center text-gray-500 py-4">
                <p>No structured data available</p>
              </div>
            )}
          </div>
        </TabItem>
      </Tabs>
    </Card>
  );
}
