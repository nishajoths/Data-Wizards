import { useEffect, useState } from "react";
import Cookies from 'js-cookie'; // Import js-cookie library

export default function Dashboard() {
    const token = Cookies.get('token'); // Get token from cookies
    const [name, setName] = useState("");

    useEffect(() => {
        const getUser = async () => {
            const res = await fetch('http://localhost:8000/me', {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });
            const data = await res.json();
            console.log(data);
            setName(data.name);
        };
        getUser();
    }, []);

    return (
      <div className="text-center mt-20">
        <h1 className="text-2xl">Hi, {name}</h1>
        <h2 className="text-2xl font-bold">Welcome to the Dashboard</h2>
        <p>Your token is:</p>
        <code className="break-all text-sm">{token}</code>
      </div>
    );
}