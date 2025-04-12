import { Outlet, useLocation } from 'react-router-dom';
import Navbar from '../components/Nav';
import Footer from '../components/Footer';
import Sidebar from '../components/Sidebar';
import Cookies from 'js-cookie';

export default function MainLayout() {
  const token = Cookies.get('token');
  const isAuthenticated = Boolean(token);
  const location = useLocation();

  // Routes that should have the sidebar (authenticated routes)
  const sidebarRoutes = [
    '/dashboard',
    '/add-project',
    '/project',
    '/extension-projects',
    '/extension-project',
    '/comparison-tool',
    '/project-success'
  ];
  
  // Check if current path should have sidebar
  const shouldShowSidebar = isAuthenticated && 
    sidebarRoutes.some(route => location.pathname.startsWith(route));

  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      
      <div className="flex flex-1">
        {shouldShowSidebar && (
          <div className="hidden md:block w-64 shrink-0">
            <Sidebar />
          </div>
        )}
        
        <main className={`flex-1 ${shouldShowSidebar ? 'ml-0 md:ml-64' : ''}`}>
          <Outlet />
        </main>
      </div>
      
      <Footer />
    </div>
  );
}
