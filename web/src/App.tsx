import { createBrowserRouter, RouterProvider } from 'react-router-dom';
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

export default function App() {
  return (
    <RouterProvider router={createBrowserRouter([
      {
        path: "/signup",
        element: <Signup />
      },
      {
        path: "/login",
        element: <Login />
      },
      {
        path: "/dashboard",
        element: <Dashboard />
      },
      {
        path: "/add-project",
        element: <AddProject />
      },
      {
        path: "/project/:projectId",
        element: <ProjectDetails />
      },
      {
        path: "/project-success",
        element: <ProjectSuccess />
      },
      {
        path: "/extension-projects",
        element: <ExtensionProjectsList />
      },
      {
        path: "/extension-project/:projectId",
        element: <ExtensionProjectDetail />
      },
      {
        path: "/comparison-tool",
        element: <ComparisonTool />
      }
    ])} />
  );
}
