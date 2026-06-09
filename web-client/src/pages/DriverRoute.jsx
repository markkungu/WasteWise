import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Polyline, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { compareCustom, clearToken } from '../services/api';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

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

function makeIcon(index, color) {
  return L.divIcon({
    className: '',
    html: `<div style="background:${color};color:#fff;border-radius:50%;width:26px;height:26px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;border:2px solid #fff;box-shadow:0 2px 4px rgba(0,0,0,0.3)">${index + 1}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

export default function DriverRoute() {
  const navigate = useNavigate();
  const [locations, setLocations] = useState([
    { name: '', lat: '', lng: '' },
    { name: '', lat: '', lng: '' },
    { name: '', lat: '', lng: '' },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const addLocation = () =>
    setLocations(prev => [...prev, { name: '', lat: '', lng: '' }]);

  const removeLocation = (i) =>
    setLocations(prev => prev.filter((_, idx) => idx !== i));

  const updateLocation = (i, field, value) =>
    setLocations(prev => prev.map((loc, idx) => idx === i ? { ...loc, [field]: value } : loc));

  const addPreset = (preset) => {
    if (locations.some(l => l.name === preset.name)) return;
    setLocations(prev => {
      const blank = prev.findIndex(l => !l.name && !l.lat && !l.lng);
      if (blank !== -1) {
        return prev.map((l, i) => i === blank ? { name: preset.name, lat: String(preset.lat), lng: String(preset.lng) } : l);
      }
      return [...prev, { name: preset.name, lat: String(preset.lat), lng: String(preset.lng) }];
    });
  };

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    setError('');
    const valid = locations.filter(l => l.name.trim() && l.lat !== '' && l.lng !== '');
    if (valid.length < 3) { setError('Add at least 3 complete locations (name + coordinates).'); return; }
    const payload = valid.map(l => ({
      name: l.name.trim(),
      lat: parseFloat(l.lat),
      lng: parseFloat(l.lng),
    }));
    if (payload.some(l => isNaN(l.lat) || isNaN(l.lng))) { setError('All coordinates must be valid numbers.'); return; }
    setLoading(true);
    try {
      const data = await compareCustom(payload);
      setResult(data);
    } catch (err) {
      if (err.response?.status === 401) { clearToken(); navigate('/login'); return; }
      setError(err.response?.data?.detail || err.response?.data?.error || 'Route optimization failed.');
    } finally {
      setLoading(false);
    }
  }, [locations, navigate]);

  const bestRoute = result
    ? (result.pso.distance_km <= result.qaoa.distance_km ? result.pso : result.qaoa)
    : null;

  const routeCoords = bestRoute
    ? bestRoute.route.map(name => {
        const loc = result && locations.find(l => l.name.trim() === name);
        if (loc && loc.lat !== '' && loc.lng !== '') return [parseFloat(loc.lat), parseFloat(loc.lng)];
        return null;
      }).filter(Boolean)
    : [];

  const mapCenter = routeCoords.length > 0
    ? [routeCoords.reduce((s, c) => s + c[0], 0) / routeCoords.length,
       routeCoords.reduce((s, c) => s + c[1], 0) / routeCoords.length]
    : [-1.2921, 36.8219];

  return (
    <div className="page-wrap" style={{ paddingTop: 28 }}>
      <h2 style={{ fontWeight: 800, marginBottom: 4 }}>Driver Route Planner</h2>
      <p style={{ color: 'var(--text-3)', marginBottom: 24, fontSize: 14 }}>
        Enter your collection stops and get the optimal route using PSO and QAOA algorithms.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: result ? '1fr 1fr' : '1fr', gap: 24 }}>
        {/* ── Input Form ─────────────────────────────────────────────────── */}
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="section-title" style={{ marginBottom: 12 }}>Quick-add Nairobi stops</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {NAIROBI_PRESETS.map(p => (
                <button
                  key={p.name}
                  className="btn btn-secondary btn-sm"
                  onClick={() => addPreset(p)}
                  disabled={locations.some(l => l.name === p.name)}
                >
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
                    <input
                      type="text"
                      placeholder={`Stop ${i + 1}`}
                      value={loc.name}
                      onChange={e => updateLocation(i, 'name', e.target.value)}
                    />
                  </div>
                  <div className="input-group" style={{ marginBottom: 0 }}>
                    {i === 0 && <label style={{ fontSize: 11 }}>Latitude</label>}
                    <input
                      type="number"
                      step="any"
                      placeholder="-1.27"
                      value={loc.lat}
                      onChange={e => updateLocation(i, 'lat', e.target.value)}
                    />
                  </div>
                  <div className="input-group" style={{ marginBottom: 0 }}>
                    {i === 0 && <label style={{ fontSize: 11 }}>Longitude</label>}
                    <input
                      type="number"
                      step="any"
                      placeholder="36.82"
                      value={loc.lng}
                      onChange={e => updateLocation(i, 'lng', e.target.value)}
                    />
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    style={{ alignSelf: 'flex-end', color: '#dc2626' }}
                    onClick={() => removeLocation(i)}
                    disabled={locations.length <= 3}
                  >
                    ✕
                  </button>
                </div>
              ))}

              <button type="button" className="btn btn-secondary btn-sm" onClick={addLocation} style={{ marginBottom: 16 }}>
                + Add location
              </button>

              {error && <div className="error-box" style={{ marginBottom: 12 }}>{error}</div>}

              <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
                {loading ? 'Optimizing route…' : 'Find best route'}
              </button>
            </div>
          </form>
        </div>

        {/* ── Results ────────────────────────────────────────────────────── */}
        {result && (
          <div>
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="section-title" style={{ marginBottom: 12 }}>Algorithm Results</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                {[
                  { label: 'PSO', solver: result.pso, color: '#2563eb' },
                  { label: 'QAOA', solver: result.qaoa, color: '#7c3aed' },
                ].map(({ label, solver, color }) => (
                  <div key={label} style={{ border: `2px solid ${solver.distance_km <= (label === 'PSO' ? result.qaoa.distance_km : result.pso.distance_km) ? color : '#e5e7eb'}`, borderRadius: 8, padding: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontWeight: 700, color }}>{label}</span>
                      {solver.distance_km <= (label === 'PSO' ? result.qaoa.distance_km : result.pso.distance_km) && (
                        <span style={{ fontSize: 11, background: color, color: '#fff', borderRadius: 4, padding: '2px 6px' }}>WINNER</span>
                      )}
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

            <div className="card" style={{ marginBottom: 16 }}>
              <div className="section-title" style={{ marginBottom: 8 }}>Best Route ({bestRoute === result.pso ? 'PSO' : 'QAOA'})</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                {bestRoute.route.map((stop, i) => (
                  <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ background: bestRoute === result.pso ? '#2563eb' : '#7c3aed', color: '#fff', borderRadius: '50%', width: 20, height: 20, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>{i + 1}</span>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{stop}</span>
                    {i < bestRoute.route.length - 1 && <span style={{ color: 'var(--text-3)' }}>→</span>}
                  </span>
                ))}
              </div>
            </div>

            <div style={{ borderRadius: 12, overflow: 'hidden', boxShadow: 'var(--shadow)' }}>
              <MapContainer center={mapCenter} zoom={12} style={{ height: 340, width: '100%' }}>
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {routeCoords.length > 1 && (
                  <Polyline
                    positions={[...routeCoords, routeCoords[0]]}
                    pathOptions={{ color: bestRoute === result.pso ? '#2563eb' : '#7c3aed', weight: 4, opacity: 0.85 }}
                  />
                )}
                {routeCoords.map((pos, i) => (
                  <Marker key={i} position={pos} icon={makeIcon(i, bestRoute === result.pso ? '#2563eb' : '#7c3aed')}>
                    <Popup><strong>{bestRoute.route[i]}</strong></Popup>
                  </Marker>
                ))}
              </MapContainer>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
