import { HiInformationCircle } from 'react-icons/hi';
import { Card, Label, Select } from 'flowbite-react';

export interface ScrapingPreferences {
  scrape_mode: 'limited' | 'all';
  pages_limit: number;
  max_depth: number;  // Include max_depth parameter
}

interface ScrapingOptionsProps {
  preferences: ScrapingPreferences;
  onChange: (preferences: ScrapingPreferences) => void;
}

export default function ScrapingOptions({ preferences, onChange }: ScrapingOptionsProps) {
  // Handler for depth change
  const handleDepthChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange({
      ...preferences,
      max_depth: parseInt(e.target.value)
    });
  };

  return (
    <Card className="mb-4">
      <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
        <HiInformationCircle className="text-blue-500" />
        Scraping Options
      </h3>
      
      <div className="space-y-4">
        <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
          <p className="text-blue-800">
            <strong>Full Website Extraction:</strong> The application will extract data from all pages found in the sitemap.
          </p>
        </div>
        
        <div>
          <Label htmlFor="max-depth" className="mb-2 block">
            Recursive Crawling Depth
          </Label>
          <Select 
            id="max-depth"
            value={preferences.max_depth}
            onChange={handleDepthChange}
            className="w-full"
          >
            <option value="1">1 - Only direct pages</option>
            <option value="2">2 - Pages and their links</option>
            <option value="3">3 - Deep crawling (recommended)</option>
            <option value="4">4 - Very deep crawling</option>
            <option value="5">5 - Extensive crawling (may be slow)</option>
          </Select>
          <p className="text-xs text-gray-600 mt-1">
            Determines how deeply the crawler will follow links across the website.
          </p>
        </div>
        
        <div className="text-sm text-gray-600">
          <p>
            This application will automatically detect and process all pages from the website without limiting the number of pages.
            For websites with a large number of pages, the extraction process may take longer to complete.
          </p>
        </div>
      </div>
    </Card>
  );
}
