import { useState } from 'react';
import { Label, Radio, TextInput, Card } from 'flowbite-react';
import { HiInformationCircle } from 'react-icons/hi';

export interface ScrapingPreferences {
  scrape_mode: 'limited' | 'all';
  pages_limit: number;
}

interface ScrapingOptionsProps {
  preferences: ScrapingPreferences;
  onChange: (preferences: ScrapingPreferences) => void;
}

export default function ScrapingOptions({ preferences, onChange }: ScrapingOptionsProps) {
  const handleModeChange = (mode: 'limited' | 'all') => {
    onChange({
      ...preferences,
      scrape_mode: mode
    });
  };

  const handleLimitChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const limit = parseInt(event.target.value, 10);
    if (!isNaN(limit) && limit > 0) {
      onChange({
        ...preferences,
        pages_limit: limit
      });
    }
  };

  return (
    <Card className="mb-4">
      <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
        <HiInformationCircle className="text-blue-500" />
        Scraping Options
      </h3>
      
      <div className="space-y-4">
        <div>
          <div className="mb-1 font-medium text-gray-700">How many pages would you like to scrape?</div>
          
          <div className="flex flex-col gap-3">
            <div className="flex items-center">
              <Radio
                id="scrape-limited"
                name="scrape-mode"
                value="limited"
                checked={preferences.scrape_mode === 'limited'}
                onChange={() => handleModeChange('limited')}
              />
              <Label htmlFor="scrape-limited" className="ml-2 flex items-center">
                <span>Limited number of pages</span>
                {preferences.scrape_mode === 'limited' && (
                  <div className="ml-3 flex items-center">
                    <TextInput
                      id="pages-limit"
                      type="number"
                      min={1}
                      max={100}
                      value={preferences.pages_limit}
                      onChange={handleLimitChange}
                      className="w-20"
                    />
                    <span className="ml-2 text-sm text-gray-500">pages</span>
                  </div>
                )}
              </Label>
            </div>
            
            <div className="flex items-center">
              <Radio
                id="scrape-all"
                name="scrape-mode"
                value="all"
                checked={preferences.scrape_mode === 'all'}
                onChange={() => handleModeChange('all')}
              />
              <div className="ml-2">
                <Label htmlFor="scrape-all">
                  Scrape all pages
                </Label>
                <p className="text-sm text-gray-500 mt-1">
                  Note: This may take a long time for large websites and could cause higher server load.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
