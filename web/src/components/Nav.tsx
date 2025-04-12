import { Link } from 'react-router-dom';
import Cookies from 'js-cookie';
import { useNavigate } from 'react-router-dom';
import { NavbarBrand,Navbar, NavbarCollapse, NavbarLink, Button } from 'flowbite-react';

export default function Nav() {
  const token = Cookies.get('token');
  const navigate = useNavigate();
  
  const handleLogout = () => {
    Cookies.remove('token');
    navigate('/login');
  };

  return (
    <Navbar fluid className="shadow-sm">
      <NavbarBrand>
        <Link to={token ? "/dashboard" : "/"} className="self-center text-xl font-semibold">
          Data Wiz
        </Link>
      </NavbarBrand>
      
      <NavbarCollapse>
        {token ? (
          <>
            <NavbarLink>
              <Link to="/dashboard">Dashboard</Link>
            </NavbarLink>
            <NavbarLink>
              <Link to="/extension-projects">Extensions</Link>
            </NavbarLink>
            <NavbarLink>
              <Link to="/comparison-tool">Compare</Link>
            </NavbarLink>
          </>
        ) : null}
      </NavbarCollapse>
      
      <div className="flex gap-2">
        {token ? (
          <Button color="light" onClick={handleLogout}>Logout</Button>
        ) : (
          <>
            <Link to="/login">
              <Button color="light">Login</Button>
            </Link>
            <Link to="/signup">
              <Button color="blue">Sign Up</Button>
            </Link>
          </>
        )}
      </div>
    </Navbar>
  );
}
