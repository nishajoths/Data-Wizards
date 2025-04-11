import { Button, Label, TextInput } from 'flowbite-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Cookies from 'js-cookie'; // Import js-cookie library

export default function Login() {
  const [form, setForm] = useState({ email: '', password: '' });
  const navigate = useNavigate();

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    const formData = new URLSearchParams();
    formData.append('username', form.email);
    formData.append('password', form.password);

    const res = await fetch('http://localhost:8000/login', {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();
    if (data.access_token) {
      Cookies.set('token', data.access_token); // Store token in cookies
      navigate('/dashboard');
    } else alert('Login failed');
  };

  return (
    <form className="max-w-md mx-auto mt-20" onSubmit={handleSubmit}>
      <Label>Email</Label>
      <TextInput required type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
      <Label>Password</Label>
      <TextInput required type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
      <Button type="submit" className="mt-4 w-full">Login</Button>
    </form>
  );
}
