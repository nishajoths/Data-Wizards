import { Button, Label, TextInput } from 'flowbite-react';
import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import Cookies from 'js-cookie';
import { HiLockClosed, HiMail } from 'react-icons/hi';

// Define interfaces for better type safety
interface LoginForm {
  email: string;
  password: string;
}

interface LoginResponse {
  access_token?: string;
  error?: string;
}

export default function Login() {
  const [form, setForm] = useState<LoginForm>({ email: '', password: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const formData = new URLSearchParams();
      formData.append('username', form.email);
      formData.append('password', form.password);

      const response = await fetch('http://localhost:8000/login', {
        method: 'POST',
        body: formData,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      const data: LoginResponse = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }

      if (data.access_token) {
        Cookies.set('token', data.access_token);
        navigate('/dashboard');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-r from-blue-50 to-white py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 border border-blue-100">
        <LoginHeader />
        
        <form className="space-y-6" onSubmit={handleSubmit}>
          <InputField
            id="email"
            name="email"
            type="email"
            label="Email address"
            placeholder="name@company.com"
            icon={HiMail}
            value={form.email}
            onChange={handleInputChange}
          />
          
          <PasswordField
            value={form.password}
            onChange={handleInputChange}
          />
          
          {error && (
            <div className="text-red-600 text-sm text-center">
              {error}
            </div>
          )}
          
          <Button 
            type="submit" 
            className="w-full bg-blue-600 hover:bg-blue-700 focus:ring-blue-500 focus:ring-offset-blue-200"
            color="blue"
            disabled={isLoading}
          >
            {isLoading ? 'Signing in...' : 'Sign in'}
          </Button>
        </form>
        
        <SignUpPrompt />
      </div>
    </div>
  );
}

// Extracted components for better organization
const LoginHeader = () => (
  <div className="text-center mb-8">
    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 mb-4">
      <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
    </div>
    <h2 className="text-3xl font-extrabold text-gray-900">Sign in to your account</h2>
    <p className="mt-2 text-sm text-gray-600">Welcome back! Please enter your details</p>
  </div>
);

const InputField = ({ id, name, type, label, placeholder, icon: Icon, value, onChange }:any) => (
  <div>
    <Label htmlFor={id} className="text-sm font-medium text-gray-700 block mb-2">{label}</Label>
    <TextInput 
      id={id}
      name={name}
      icon={Icon}
      required 
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      className="focus:ring-blue-500 focus:border-blue-500"
    />
  </div>
);

const PasswordField = ({ value, onChange }:any) => (
  <div>
    <div className="flex items-center justify-between mb-2">
      <Label htmlFor="password" className="text-sm font-medium text-gray-700">Password</Label>
      <a href="#" className="text-sm text-blue-600 hover:text-blue-800">Forgot password?</a>
    </div>
    <TextInput 
      id="password"
      name="password"
      icon={HiLockClosed}
      required 
      type="password"
      placeholder="••••••••"
      value={value}
      onChange={onChange}
      className="focus:ring-blue-500 focus:border-blue-500"
    />
  </div>
);

const SignUpPrompt = () => (
  <div className="mt-6 text-center">
    <p className="text-sm text-gray-600">
      Don't have an account?{" "}
      <a href="#" className="font-medium text-blue-600 hover:text-blue-500">
        Sign up
      </a>
    </p>
  </div>
);
