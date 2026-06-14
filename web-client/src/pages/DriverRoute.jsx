import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { compareCustom, clearToken } from '../services/api';

const NAIROBI_PRESETS = [
  { name: 'Westlands',  lat: -1.2676, lng: 36.8116 },
  { name: 'Kibera',     lat: -1.3133, lng: 36.7897 },
  { name: 'Mathare',    lat: -1.2574, lng: 36.8561 },
  { name: 'Eastleigh',  lat: -1.2747, lng: 36.8476 },
  { name: 'Embakasi',   lat: -1.3204, lng: 36.8944 },
  { name: 'Ruaraka',    lat: -1.2412, lng: 36.8677 },
  { name: 'Kasarani',   lat: -1.2215, lng: 36.8951 },
  { name: 'Dagoretti',  lat: -1.2877, lng: 36.7434 },
  { name: 'Langata',    lat: -1.3367, lng: 36.7597 },
  { name: 'Karen',      lat: -1.3186, lng: 36.7118 },
];

export default function DriverRoute() {
  const navigate = useNavigate();
  const [locations, setLocations] = useState([
    { name: '', lat: '', lng: '' },
    { name: '', lat: '', lng: '' },
    { name: '', lat: '', lng: '' },
  ]);
  const [startLocation, setStartLocation] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');
  const [result, setResult] = useState(null);

  const addLocation    = () => setLocations(p => [...p, { name: '', lat: '', lng: '' }]);
  const removeLocation = (i) => setLocations(p => p.filter((_, idx) => idx !== i));
  const updateLocation = (i, field, value) => {
    setLocations(p => {
      const updated = p.map((l, idx) => idx === i ? { ...l, [field]: value } : l);
      // Keep start location in sync: if none set, default to first named location
      if (field === 'name') {
        const firstNamed = updated.find(l => l.name.trim())?.name.trim() || '';
        setStartLocation(prev => prev || firstNamed);
      }
      return updated;
    });
  };

  const addPreset = (preset) => {
    if (locations.some(l => l.name === preset.name)) return;
    setLocations(prev => {
      const blank = prev.findIndex(l => !l.name && !l.lat && !l.lng);
      const updated = blank !== -1
        ? prev.map((l, i) => i === blank ? { name: preset.name, lat: String(preset.lat), lng: String(preset.lng) } : l)
        : [...prev, { name: preset.name, lat: String(preset.lat), lng: String(preset.lng) }];
      // Default start to first named location if not yet chosen
      setStartLocation(s => s || preset.name);
      return updated;
    });
  };

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    setError('');
    const valid = locations.filter(l => l.name.trim() && l.lat !== '' && l.lng !== '');
    if (valid.length < 3) { setError('Add at least 3 complete locations.'); return; }
    const payload = valid.map(l => ({ name: l.name.trim(), lat: parseFloat(l.lat), lng: parseFloat(l.lng) }));
    if (payload.some(l => isNaN(l.lat) || isNaN(l.lng))) { setError('All coordinates must be valid numbers.'); return; }
    setLoading(true);
    try {
      const data = await compareCustom(payload, startLocation || null);
      setResult(data);
    } catch (err) {
      if (err.response?.status === 401) { clearToken(); navigate('/login'); return; }
      setError(err.response?.data?.detail || err.response?.data?.error || 'Route optimization failed.');
    } finally {
      setLoading(false);
    }
  }, [locations, navigate]);

  const bestRoute = result
    ? (result.pso.distance_km <= result.qaoa.distance_km ? { ...result.pso, label: 'PSO', color: '#2563eb' } : { ...result.qaoa, label: 'QAOA', color: '#7c3aed' })
    : null;

  return (
    <div className="page-wrap" style={{ paddingTop: 28 }}>
      <h2 style={{ fontWeight: 800, marginBottom: 4 }}>Driver Route Planner</h2>
      <p style={{ color: 'var(--text-3)', marginBottom: 24, fontSize: 14 }}>
        Enter your collection stops and get the optimal route using PSO and QAOA algorithms.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: result ? '1fr 1fr' : '1fr', gap: 24 }}>

        {/* ── Input form ── */}
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="section-title" style={{ marginBottom: 12 }}>Quick-add Nairobi stops</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {NAIROBI_PRESETS.map(p => (
                <button key={p.name} className="btn btn-secondary btn-sm"
                  onClick={() => addPreset(p)}
                  disabled={locations.some(l => l.name === p.name)}>
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="card">
              <div className="section-title" style={{ marginBottom: 12 }}>Locations to visit</div>
              {locations.map((loc, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 100px auto', gap: 8, marginBottom: 10, alignItems: 'end' }}>
                  <div className="input-group" style={{ marginBottom: 0 }}>
                    {i === 0 && <label style={{ fontSize: 11 }}>Location name</label>}
                    <input type="text" placeholder={`Stop ${i + 1}`} value={loc.name} onChange={e => updateLocation(i, 'name', e.target.value)} />
                  </div>
                  <div className="input-group" style={{ marginBottom: 0 }}>
                    {i === 0 && <label style={{ fontSize: 11 }}>Latitude</label>}
                    <input type="number" step="any" placeholder="-1.27" value={loc.lat} onChange={e => updateLocation(i, 'lat', e.target.value)} />
                  </div>
                  <div className="input-group" style={{ marginBottom: 0 }}>
                    {i === 0 && <label style={{ fontSize: 11 }}>Longitude</label>}
                    <input type="number" step="any" placeholder="36.82" value={loc.lng} onChange={e => updateLocation(i, 'lng', e.target.value)} />
                  </div>
                  <button type="button" className="btn btn-secondary btn-sm"
                    style={{ alignSelf: 'flex-end', color: '#dc2626' }}
                    onClick={() => removeLocation(i)} disabled={locations.length <= 3}>✕</button>
                </div>
              ))}
              <button type="button" className="btn btn-secondary btn-sm" onClick={addLocation} style={{ marginBottom: 16 }}>
                + Add location
              </button>

              <div className="input-group" style={{ marginBottom: 16 }}>
                <label>Starting point</label>
                <select value={startLocation} onChange={e => setStartLocation(e.target.value)}>
                  <option value="">— Auto (solver decides) —</option>
                  {locations.filter(l => l.name.trim()).map((l, i) => (
                    <option key={i} value={l.name.trim()}>{l.name.trim()}</option>
                  ))}
                </select>
              </div>

              {error && <div className="error-box" style={{ marginBottom: 12 }}>{error}</div>}
              <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
                {loading ? 'Optimizing route…' : 'Find best route'}
              </button>
            </div>
          </form>
        </div>

        {/* ── Results ── */}
        {result && (
          <div>
            {/* Algorithm comparison */}
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="section-title" style={{ marginBottom: 12 }}>Algorithm Results</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                {[
                  { label: 'PSO', solver: result.pso, color: '#2563eb', wins: result.pso.distance_km <= result.qaoa.distance_km },
                  { label: 'QAOA', solver: result.qaoa, color: '#7c3aed', wins: result.qaoa.distance_km < result.pso.distance_km },
                ].map(({ label, solver, color, wins }) => (
                  <div key={label} style={{ border: `2px solid ${wins ? color : '#e5e7eb'}`, borderRadius: 8, padding: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontWeight: 700, color }}>{label}</span>
                      {wins && <span style={{ fontSize: 11, background: color, color: '#fff', borderRadius: 4, padding: '2px 6px' }}>BEST</span>}
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 800 }}>{solver.distance_km} km</div>
                    <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{solver.runtime_s}s runtime</div>
                  </div>
                ))}
              </div>
              {result.optimal_distance_km && (
                <div style={{ fontSize: 13, color: 'var(--text-3)', borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                  Optimal (brute-force): <strong>{result.optimal_distance_km} km</strong>
                  {result.pso_quality_pct && <span> · PSO quality: {result.pso_quality_pct}%</span>}
                  {result.qaoa_quality_pct && <span> · QAOA quality: {result.qaoa_quality_pct}%</span>}
                </div>
              )}
            </div>

            {/* Best route step-by-step */}
            <div className="card">
              <div className="section-title" style={{ marginBottom: 12 }}>
                Best Route —{' '}
                <span style={{ color: bestRoute.color }}>{bestRoute.label}</span>
                <span style={{ fontWeight: 400, color: 'var(--text-3)', fontSize: 13 }}> · {bestRoute.distance_km} km</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {bestRoute.route.map((stop, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <div style={{
                        background: bestRoute.color, color: '#fff', borderRadius: '50%',
                        width: 28, height: 28, display: 'flex', alignItems: 'center',
                        justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0,
                      }}>{i + 1}</div>
                      {i < bestRoute.route.length - 1 && (
                        <div style={{ width: 2, height: 24, background: '#e5e7eb' }} />
                      )}
                    </div>
                    <div style={{ paddingBottom: i < bestRoute.route.length - 1 ? 0 : 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 15 }}>{stop}</div>
                      {i === 0 && <div style={{ fontSize: 11, color: '#16a34a' }}>Start</div>}
                      {i === bestRoute.route.length - 1 && <div style={{ fontSize: 11, color: '#dc2626' }}>End</div>}
                    </div>
                  </div>
                ))}
              </div>
              {result.note && (
                <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 16, fontStyle: 'italic', borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                  {result.note}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
