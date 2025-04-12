import { Sidebar, SidebarItem, SidebarItemGroup, SidebarItems } from 'flowbite-react';
import { Link } from 'react-router-dom';
import { LayoutGrid, Plus, FileStack, Monitor } from 'lucide-react';
import Cookies from 'js-cookie';

export default function SidebarComponent() {
  const token = Cookies.get('token');
  
  if (!token) return null; // Only show sidebar when logged in
  
  // Common styling for icons
  const iconStyle = { size: 20, strokeWidth: 1.75 };
  
  return (
    <div className="sticky top-0 h-screen w-64 bg-white shadow-md overflow-y-auto overflow-x-hidden z-10">
      <Sidebar aria-label="Navigation sidebar" className="h-full border-none">
        <SidebarItems>
          <SidebarItemGroup>
            <SidebarItem 
              as={Link} 
              href="/dashboard" 
              icon={() => <LayoutGrid {...iconStyle} className="text-blue-600" />}
              className="hover:bg-blue-50"
            >
              <span className="text-gray-700">Dashboard</span>
            </SidebarItem>
            
            <SidebarItem 
              as={Link} 
              href="/add-project" 
              icon={() => <Plus {...iconStyle} className="text-blue-600" />}
              className="hover:bg-blue-50"
            >
              <span className="text-gray-700">Add Project</span>
            </SidebarItem>
            
            <SidebarItem 
              as={Link} 
              href="/extension-projects" 
              icon={() => <Monitor {...iconStyle} className="text-blue-600" />}
              className="hover:bg-blue-50"
            >
              <span className="text-gray-700">Extension Projects</span>
            </SidebarItem>
            
            <SidebarItem 
              as={Link} 
              href="/comparison-tool" 
              icon={() => <FileStack {...iconStyle} className="text-blue-600" />}
              className="hover:bg-blue-50"
            >
              <span className="text-gray-700">Compare Sites</span>
            </SidebarItem>
          </SidebarItemGroup>
        </SidebarItems>
      </Sidebar>
      
      <div className="absolute bottom-0 left-0 w-full p-4 border-t border-gray-200 bg-gray-50">
        <div className="flex items-center space-x-2">
          <div className="h-2 w-2 rounded-full bg-green-500"></div>
          <span className="text-xs text-gray-600">Connected</span>
        </div>
      </div>
    </div>
  );
  
}
