import { Button, Label, TextInput } from 'flowbite-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Signup() {
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const navigate = useNavigate();

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    const res = await fetch('http://localhost:8000/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    if (res.ok) navigate('/login');
    else alert('Signup failed');
  };

  return (
    <form className="max-w-md mx-auto mt-20" onSubmit={handleSubmit}>
      <Label>Name</Label>
      <TextInput required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
      <Label>Email</Label>
      <TextInput required type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
      <Label>Password</Label>
      <TextInput required type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
      <Button type="submit" className="mt-4 w-full">Sign Up</Button>
    </form>
  );
}