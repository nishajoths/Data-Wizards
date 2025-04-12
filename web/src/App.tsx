import { createBrowserRouter, RouterProvider, Navigate, Outlet, useLocation } from 'react-router-dom';
import './index.css';
import Signup from './pages/Signup';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import AddProject from './pages/AddProject';
import ProjectDetails from './pages/ProjectDetails';
import ProjectSuccess from './pages/ProjectSuccess';
import ExtensionProjectsList from './pages/ExtensionProjectsList';
import ExtensionProjectDetail from './pages/ExtensionProjectDetail';
import ComparisonTool from './pages/ComparisonTool';
import Navbar from './components/Nav';
import Footer from './components/Footer';
import Sidebar from './components/Sidebar';
import Cookies from 'js-cookie';

// Auth guard for protected routes
const ProtectedRoute = ({ children }: { children: JSX.Element }) => {
  const token = Cookies.get('token');
  if (!token) {
    return <Navigate to="/login" />;
  }
  return children;
};

// Simple layout with navbar, sidebar and footer
const AppLayout = () => {
  const token = Cookies.get('token');
  const location = useLocation();
  
  // Check if current path is login or signup
  const isAuthPage = location.pathname === '/login' || location.pathname === '/signup';
  
  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <div className="flex flex-1">
        {token && !isAuthPage && <Sidebar />}
        <main className={`flex-1 p-4 ${token && !isAuthPage ? 'ml-0' : 'w-full'}`}>
          <Outlet />
        </main>
      </div>
      <Footer />
    </div>
  );
};

export default function App() {
  return (
    <RouterProvider router={createBrowserRouter([
      {
        path: "/",
        element: <AppLayout />,
        children: [
          {
            index: true,
            element: <Navigate to="/dashboard" replace />
          },
          {
            path: "/dashboard",
            element: <ProtectedRoute><Dashboard /></ProtectedRoute>
          },
          {
            path: "/add-project",
            element: <ProtectedRoute><AddProject /></ProtectedRoute>
          },
          {
            path: "/project/:projectId",
            element: <ProtectedRoute><ProjectDetails /></ProtectedRoute>
          },
          {
            path: "/project-success",
            element: <ProtectedRoute><ProjectSuccess /></ProtectedRoute>
          },
          {
            path: "/extension-projects",
            element: <ProtectedRoute><ExtensionProjectsList /></ProtectedRoute>
          },
          {
            path: "/extension-project/:projectId",
            element: <ProtectedRoute><ExtensionProjectDetail /></ProtectedRoute>
          },
          {
            path: "/comparison-tool",
            element: <ProtectedRoute><ComparisonTool /></ProtectedRoute>
          },
          {
            path: "/signup",
            element: <Signup />
          },
          {
            path: "/login",
            element: <Login />
          }
        ]
      }
    ])} />
  );
}
