import { useState } from "react";
import { Card, Button, Spinner, Alert, Textarea, Label, Badge, Tooltip } from 'flowbite-react';
import { HiPlus, HiTrash, HiSearch, HiCheck, HiX, HiInformationCircle, HiTable, HiDocumentText } from 'react-icons/hi';
import Cookies from 'js-cookie';

interface ComparisonItem {
  id: string;
  description: string;
}

interface ComparisonResult {
  raw_response: string;
  similarities: string[];
  differences: string[];
  comparison_table: string[];
}

export default function ComparisonTool() {
  const [items, setItems] = useState<ComparisonItem[]>([
    { id: "1", description: "" },
    { id: "2", description: "" }
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ComparisonResult | null>(null);
  
  const token = Cookies.get('token');
  
  const addItem = () => {
    const newId = String(items.length + 1);
    setItems([...items, { id: newId, description: "" }]);
  };
  
  const removeItem = (id: string) => {
    if (items.length <= 2) {
      setError("At least 2 items are required for comparison");
      return;
    }
    setItems(items.filter(item => item.id !== id));
  };
  
  const updateItem = (id: string, description: string) => {
    setItems(items.map(item => {
      if (item.id === id) {
        return { ...item, description };
      }
      return item;
    }));
  };
  
  const handleCompare = async () => {
    if (!token) {
      setError("Authentication token not found. Please log in.");
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      
      // Validate items have a description
      const invalidItems = items.filter(item => !item.description.trim());
      if (invalidItems.length > 0) {
        throw new Error("All items must have a description");
      }
      
      // Prepare request data
      const requestData = {
        items: items.map((item, index) => ({
          title: `Item ${index + 1}`,
          description: item.description,
          attributes: {} // Empty attributes object as we only care about descriptions
        }))
      };
      
      // Make API request
      const response = await fetch('http://localhost:8000/api/compare-items', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(requestData)
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: "Failed to parse error" }));
        throw new Error(errorData.detail || `Request failed with status: ${response.status}`);
      }
      
      const data = await response.json();
      setResult(data.comparison_result);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred during comparison");
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="bg-gradient-to-b from-blue-50 to-white min-h-screen pb-12">
      {/* Hero Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white py-10 px-4 mb-8 shadow-lg">
        <div className="container mx-auto">
          <h1 className="text-4xl font-bold mb-2">Comparison Tool</h1>
          <p className="text-xl opacity-90">Compare multiple items using advanced AI analysis</p>
        </div>
      </div>
      
      <div className="container mx-auto px-4 max-w-7xl">
        {error && (
          <Alert color="failure" className="mb-6 border-l-4 border-red-500 shadow-sm">
            <div className="flex items-center gap-3">
              <HiX className="h-5 w-5 text-red-500" />
              <div>
                <div className="font-medium text-red-800">Error</div>
                <p className="text-red-700">{error}</p>
              </div>
            </div>
          </Alert>
        )}
        
        <div className="bg-white p-6 rounded-xl shadow-md mb-8">
          <div className="flex justify-between items-center mb-6 border-b pb-4">
            <h2 className="text-2xl font-semibold text-gray-800 flex items-center">
              <span className="bg-blue-100 text-blue-800 p-1 rounded-md mr-2">
                <HiDocumentText className="h-6 w-6" />
              </span>
              Items to Compare
            </h2>
            <Button 
              size="sm" 
              onClick={addItem} 
            //   gradientDuoTone="purpleToBlue"
              className="transition-all hover:scale-105"
            >
              <HiPlus className="mr-2 h-4 w-4" /> Add Item
            </Button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {items.map((item, index) => (
              <Card key={item.id} className="relative border-0 shadow-md hover:shadow-lg transition-shadow duration-300">
                <div className="absolute -top-3 -left-3">
                  <Badge color="indigo" size="sm" className="rounded-full px-3 font-semibold shadow">
                    Item {item.id}
                  </Badge>
                </div>
                
                {items.length > 2 && (
                  <button 
                    className="absolute top-2 right-2 text-gray-400 hover:text-red-500 transition-colors p-1 rounded-full hover:bg-red-50"
                    onClick={() => removeItem(item.id)}
                    aria-label="Remove item"
                  >
                    <HiTrash className="h-5 w-5" />
                  </button>
                )}
                
                <div className="mb-4 mt-3">
                  <Label 
                    htmlFor={`description-${item.id}`} 
                    className="text-gray-700 font-medium mb-2 block"
                  >
                    Description
                  </Label>
                  <Textarea
                    id={`description-${item.id}`}
                    value={item.description}
                    onChange={(e) => updateItem(item.id, e.target.value)}
                    placeholder="Describe the item or product in detail..."
                    rows={5}
                    required
                    className="focus:border-blue-500 focus:ring-blue-500"
                    // helperText={`Item ${index + 1} description - Be as detailed as possible`}
                  />
                </div>
              </Card>
            ))}
          </div>
          
          <div className="flex justify-center mt-8">
            <Button
            //   gradientDuoTone="cyanToBlue"
              size="lg"
              onClick={handleCompare}
              disabled={loading}
              className="px-8 py-3 font-medium text-base shadow-lg hover:shadow-xl transition-all"
            >
              {loading ? (
                <>
                  <Spinner size="sm" className="mr-3" />
                  Analyzing...
                </>
              ) : (
                <>
                  <HiSearch className="mr-2 h-5 w-5" />
                  Compare Items
                </>
              )}
            </Button>
          </div>
        </div>
        
        {/* Results section */}
        {result && (
          <div className="mt-10 animate-fadeIn">
            <div className="flex items-center mb-6">
              <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center mr-3">
                <HiCheck className="h-6 w-6 text-green-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-800">Comparison Results</h2>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              {/* Similarities */}
              <Card className="border-t-4 border-green-500 shadow-md hover:shadow-lg transition-shadow">
                <div className="flex items-center mb-4">
                  <div className="bg-green-100 p-2 rounded-md mr-3">
                    <HiCheck className="h-5 w-5 text-green-600" />
                  </div>
                  <h3 className="text-xl font-semibold text-green-700">Similarities</h3>
                </div>
                
                {result.similarities.length > 0 ? (
                  <ul className="list-disc pl-5 space-y-3">
                    {result.similarities.map((item, index) => (
                      <li key={index} className="text-gray-700 leading-relaxed">
                        {item}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-center py-6 bg-gray-50 rounded-lg">
                    <p className="text-gray-500">No similarities found</p>
                  </div>
                )}
              </Card>
              
              {/* Differences */}
              <Card className="border-t-4 border-red-500 shadow-md hover:shadow-lg transition-shadow">
                <div className="flex items-center mb-4">
                  <div className="bg-red-100 p-2 rounded-md mr-3">
                    <HiX className="h-5 w-5 text-red-600" />
                  </div>
                  <h3 className="text-xl font-semibold text-red-700">Differences</h3>
                </div>
                
                {result.differences.length > 0 ? (
                  <ul className="list-disc pl-5 space-y-3">
                    {result.differences.map((item, index) => (
                      <li key={index} className="text-gray-700 leading-relaxed">
                        {item}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-center py-6 bg-gray-50 rounded-lg">
                    <p className="text-gray-500">No differences found</p>
                  </div>
                )}
              </Card>
            </div>
            
            {/* Comparison table */}
            {result.comparison_table.length > 0 && (
              <Card className="mb-8 shadow-md hover:shadow-lg transition-shadow border-t-4 border-blue-500">
                <div className="flex items-center mb-4">
                  <div className="bg-blue-100 p-2 rounded-md mr-3">
                    <HiTable className="h-5 w-5 text-blue-600" />
                  </div>
                  <h3 className="text-xl font-semibold text-blue-700">Comparison Table</h3>
                </div>
                
                <div className="bg-gray-50 p-5 rounded-lg text-sm overflow-x-auto">
                  <div className="whitespace-pre-wrap font-mono bg-white border border-gray-200 rounded-md p-4 shadow-inner">
                    {result.comparison_table.map((line, index) => (
                      <div key={index} className="py-1">{line}</div>
                    ))}
                  </div>
                </div>
              </Card>
            )}
            
            {/* Raw response */}
            <Card className="mb-8 shadow-md hover:shadow-lg transition-shadow border-t-4 border-purple-500">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center">
                  <div className="bg-purple-100 p-2 rounded-md mr-3">
                    <HiInformationCircle className="h-5 w-5 text-purple-600" />
                  </div>
                  <h3 className="text-xl font-semibold text-purple-700">Detailed Analysis</h3>
                </div>
                
                <Tooltip content="AI's complete analysis output">
                  <HiInformationCircle className="h-5 w-5 text-gray-500" />
                </Tooltip>
              </div>
              
              <div className="bg-gray-50 p-5 rounded-lg">
                <div className="whitespace-pre-wrap bg-white border border-gray-200 rounded-md p-4 shadow-inner text-gray-700 leading-relaxed max-h-96 overflow-y-auto">
                  {result.raw_response}
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
