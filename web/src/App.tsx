import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './index.css';
import Signup from './pages/Signup';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import AddProject from './pages/AddProject';
import ProjectDetails from './pages/ProjectDetails';
import ProjectSuccess from './pages/ProjectSuccess';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/signup" element={<Signup />} />
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/add-project" element={<AddProject />} />
        <Route path="/project/:projectId" element={<ProjectDetails />} />
        <Route path="/project-success" element={<ProjectSuccess />} />
      </Routes>
    </BrowserRouter>
  )
}
