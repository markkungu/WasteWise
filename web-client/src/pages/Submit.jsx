import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { submitWaste, clearToken } from '../services/api';

const REJECTION_LABELS = {
  REJECTED_SPOOF: 'Image appears to be a duplicate or digitally manipulated.',
  REJECTED_INVALID_MATERIAL: 'No recyclable plastic was detected in the image.',
  REJECTED_LOW_QUALITY: 'Image quality is too low for reliable verification.',
};

export default function Submit() {
  const navigate = useNavigate();
  const fileRef = useRef();

  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState(null);
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [locLabel, setLocLabel] = useState('');
  const [locLoading, setLocLoading] = useState(false);
  const [weight, setWeight] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  function handleFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    setImage(file);
    setPreview(URL.createObjectURL(file));
    setError('');
  }

  function handleGetLocation() {
    if (!navigator.geolocation) { setError('Geolocation is not supported by your browser.'); return; }
    setLocLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude);
        setLng(pos.coords.longitude);
        setLocLabel(`${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`);
        setLocLoading(false);
      },
      () => { setError('Could not get location. Please allow location access.'); setLocLoading(false); }
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!image) { setError('Please select or capture a photo.'); return; }
    if (!lat || !lng) { setError('Please capture your current location.'); return; }
    if (weight && (isNaN(weight) || Number(weight) <= 0)) { setError('Weight must be a positive number.'); return; }

    setError('');
    setLoading(true);
    try {
      const data = await submitWaste(image, lat, lng, weight ? Number(weight) : null);
      setResult(data);
    } catch (err) {
      if (err.response?.status === 401) { clearToken(); navigate('/login'); return; }
      setError(err.response?.data?.error || 'Submission failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setImage(null); setPreview(null); setLat(''); setLng('');
    setLocLabel(''); setWeight(''); setError(''); setResult(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  if (result) {
    const approved = result.verification_result === 'APPROVED';
    const pending = result.verification_result === 'PENDING';
    const color = approved ? 'var(--green)' : pending ? 'var(--yellow-text)' : 'var(--red-text)';
    const bg = approved ? 'var(--green-bg)' : pending ? 'var(--yellow-bg)' : 'var(--red-bg)';

    return (
      <div className="page-wrap" style={{ paddingTop: 28 }}>
        <div className="card" style={{ textAlign: 'center', border: `2px solid ${color}` }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>{approved ? '✅' : pending ? '⏳' : '❌'}</div>
          <h2 style={{ color, fontWeight: 800, marginBottom: 8 }}>
            {approved ? 'Waste Verified!' : pending ? 'Pending Verification' : 'Verification Failed'}
          </h2>
          {result.verification_result?.startsWith('REJECTED') && (
            <p style={{ color: 'var(--text-2)', marginBottom: 12 }}>
              {REJECTION_LABELS[result.verification_result] || 'Submission was rejected.'}
            </p>
          )}

          {approved && result.reward && (
            <div style={{ background: bg, borderRadius: 10, padding: '14px 18px', marginBottom: 14 }}>
              <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 4 }}>Tokens Earned</div>
              <span className="token-amount" style={{ fontSize: 28 }}>{Number(result.reward.token_amount || 0).toFixed(2)}</span>
              <span className="token-symbol">WWT</span>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>70% credited now · 30% released on collection</div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', fontSize: 13, color: 'var(--text-3)', marginBottom: 16 }}>
            {result.primary_category && <span>Type: <strong>{result.primary_category}</strong></span>}
            {result.confidence_score && <span>Confidence: <strong>{Math.round(result.confidence_score * 100)}%</strong></span>}
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button className="btn btn-primary" onClick={reset}>Submit Another</button>
            <button className="btn btn-secondary" onClick={() => navigate('/')}>Back to Home</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-wrap" style={{ paddingTop: 28 }}>
      <h2 style={{ fontWeight: 800, marginBottom: 4 }}>Submit Waste</h2>
      <p style={{ color: 'var(--text-3)', fontSize: 14, marginBottom: 20 }}>
        Upload a photo of plastic waste. Our AI will verify and reward you with WWT tokens.
      </p>

      {error && <div className="error-box">{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="section-title">Photo</div>
          {preview ? (
            <div>
              <img src={preview} alt="Preview" style={{ width: '100%', borderRadius: 8, marginBottom: 10, maxHeight: 260, objectFit: 'cover' }} />
              <button type="button" className="btn btn-secondary btn-full" onClick={() => { setImage(null); setPreview(null); fileRef.current.value = ''; }}>
                Change Photo
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label className="btn btn-primary btn-full" style={{ cursor: 'pointer' }}>
                📷 Take Photo
                <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleFileChange} />
              </label>
              <label className="btn btn-secondary btn-full" style={{ cursor: 'pointer' }}>
                🖼 Choose from Gallery
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />
              </label>
            </div>
          )}
        </div>

        <div className="card" style={{ marginBottom: 14 }}>
          <div className="section-title">Location</div>
          <button
            type="button"
            className={`btn btn-full ${lat ? 'btn-primary' : 'btn-blue'}`}
            onClick={handleGetLocation}
            disabled={locLoading}
          >
            {locLoading ? 'Getting location…' : lat ? `📍 ${locLabel}` : '📍 Use Current Location'}
          </button>
        </div>

        <div className="card" style={{ marginBottom: 20 }}>
          <div className="section-title">Estimated Weight <span style={{ fontWeight: 400, color: 'var(--text-3)', fontSize: 13 }}>(optional)</span></div>
          <div className="input-group" style={{ marginBottom: 0 }}>
            <input
              type="number"
              min="0"
              step="0.01"
              value={weight}
              onChange={e => setWeight(e.target.value)}
              placeholder="e.g. 0.5"
            />
            <span className="input-hint">Kilograms</span>
          </div>
        </div>

        <button type="submit" className="btn btn-primary btn-full btn-lg" disabled={loading}>
          {loading ? '⏳ Verifying with AI…' : 'Submit for Verification'}
        </button>
      </form>
    </div>
  );
}
