import { useState } from 'react';
import { api, token } from '../api.js';
import { Button, Card, Input } from '../ui.jsx';

export default function LoginPage({ onLogin }) {
  const [email, setEmail] = useState('operator@example.com');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const data = await api('/api/auth/login', { method: 'POST', body: { email, password } });
      token.set(data.token);
      onLogin(data.user);
    } catch (e2) { setError(e2.message); }
    finally { setLoading(false); }
  }

  return (
    <div className="mx-auto mt-24 max-w-sm">
      <Card>
        <h1 className="mb-4 text-lg font-semibold">JavaMifi Rental Desk</h1>
        <form onSubmit={submit} className="space-y-3">
          <Input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button className="w-full" disabled={loading}>{loading ? 'Signing in…' : 'Sign in'}</Button>
        </form>
      </Card>
    </div>
  );
}
