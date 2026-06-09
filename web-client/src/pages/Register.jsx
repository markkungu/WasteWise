import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { register } from '../services/api';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WALLET_RE = /^0x[0-9a-fA-F]{40}$/;

export default function Register() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '', wallet: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function set(field) { return e => setForm(f => ({ ...f, [field]: e.target.value })); }

  function validate() {
    if (form.name.trim().length < 2) return 'Name must be at least 2 characters.';
    if (!EMAIL_RE.test(form.email)) return 'Enter a valid email address.';
    if (form.password.length < 8) return 'Password must be at least 8 characters.';
    if (form.password !== form.confirm) return 'Passwords do not match.';
    if (form.wallet && !WALLET_RE.test(form.wallet)) return 'Wallet address must be a valid Ethereum address (0x…).';
    return null;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const err = validate();
    if (err) { setError(err); return; }
    setError('');
    setLoading(true);
    try {
      await register(form.name.trim(), form.email.trim().toLowerCase(), form.password, form.wallet || undefined);
      navigate('/login', { state: { message: 'Account created! Sign in to continue.' } });
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed. Try again.');
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
          <p style={{ color: 'var(--text-3)', marginTop: 4 }}>Join the recycling revolution</p>
        </div>

        <div className="card">
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 18 }}>Create Account</h2>

          {error && <div className="error-box">{error}</div>}

          <form onSubmit={handleSubmit}>
            <div className="input-group">
              <label>Full Name</label>
              <input value={form.name} onChange={set('name')} placeholder="Jane Doe" autoComplete="name" />
            </div>
            <div className="input-group">
              <label>Email</label>
              <input type="email" value={form.email} onChange={set('email')} placeholder="you@example.com" autoComplete="email" />
            </div>
            <div className="input-group">
              <label>Password</label>
              <input type="password" value={form.password} onChange={set('password')} placeholder="Min. 8 characters" autoComplete="new-password" />
            </div>
            <div className="input-group">
              <label>Confirm Password</label>
              <input type="password" value={form.confirm} onChange={set('confirm')} placeholder="Repeat password" autoComplete="new-password" />
            </div>
            <div className="input-group">
              <label>Wallet Address <span style={{ fontWeight: 400, color: 'var(--text-3)' }}>(optional)</span></label>
              <input value={form.wallet} onChange={set('wallet')} placeholder="0x…" />
              <span className="input-hint">Ethereum address for receiving WWT tokens</span>
            </div>
            <button type="submit" className="btn btn-primary btn-full btn-lg" disabled={loading} style={{ marginTop: 4 }}>
              {loading ? 'Creating account…' : 'Create Account'}
            </button>
          </form>

          <p style={{ textAlign: 'center', marginTop: 16, fontSize: 14, color: 'var(--text-3)' }}>
            Already have an account?{' '}
            <Link to="/login" style={{ color: 'var(--green)', fontWeight: 600 }}>Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
