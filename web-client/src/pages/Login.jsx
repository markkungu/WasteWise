import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { login, storeToken } from '../services/api';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const successMsg = location.state?.message;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!email || !password) { setError('Email and password are required.'); return; }
    setLoading(true);
    try {
      const data = await login(email.trim().toLowerCase(), password);
      storeToken(data.token);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed. Check your credentials.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--green-light)', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 36, marginBottom: 6 }}>♻</div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--green)' }}>WasteWise</h1>
          <p style={{ color: 'var(--text-3)', marginTop: 4 }}>Recycle. Earn. Repeat.</p>
        </div>

        <div className="card">
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 18 }}>Sign In</h2>

          {successMsg && <div className="success-box">{successMsg}</div>}
          {error && <div className="error-box">{error}</div>}

          <form onSubmit={handleSubmit}>
            <div className="input-group">
              <label>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
            </div>
            <div className="input-group">
              <label>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" />
            </div>
            <button type="submit" className="btn btn-primary btn-full btn-lg" disabled={loading} style={{ marginTop: 4 }}>
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          <p style={{ textAlign: 'center', marginTop: 16, fontSize: 14, color: 'var(--text-3)' }}>
            Don't have an account?{' '}
            <Link to="/register" style={{ color: 'var(--green)', fontWeight: 600 }}>Create one</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
