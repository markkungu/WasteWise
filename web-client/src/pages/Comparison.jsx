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

// ── Convergence Chart ────────────────────────────────────────────────────────
function ConvergenceChart({ psoData, qaoaFinal, width = 600, height = 300 }) {
  if (!psoData || psoData.length === 0) return null;
  const PAD = { top: 20, right: 20, bottom: 48, left: 60 };
  const W = width - PAD.left - PAD.right;
  const H = height - PAD.top - PAD.bottom;
  const allValues = [...psoData, qaoaFinal];
  const minY = Math.min(...allValues) * 0.97;
  const maxY = Math.max(...allValues) * 1.03;
  const toX = (i) => (i / Math.max(psoData.length - 1, 1)) * W;
  const toY = (v) => H - ((v - minY) / (maxY - minY)) * H;
  const psoPoints = psoData.map((v, i) => `${toX(i)},${toY(v)}`).join(' ');
  const qaY = toY(qaoaFinal);
  const crossover = psoData.findIndex(v => v <= qaoaFinal);
  const tickCount = 5;
  const yTicks = Array.from({ length: tickCount }, (_, i) => {
    const v = minY + ((maxY - minY) * i) / (tickCount - 1);
    return { v, y: toY(v) };
  });
  const xTickStep = Math.ceil(psoData.length / 6);
  const xTicks = psoData.map((_, i) => i).filter(i => i === 0 || i === psoData.length - 1 || i % xTickStep === 0);

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={width} height={height} style={{ display: 'block', maxWidth: '100%' }}>
        <g transform={`translate(${PAD.left},${PAD.top})`}>
          {yTicks.map(({ y }, i) => <line key={i} x1={0} y1={y} x2={W} y2={y} stroke="#e5e7eb" strokeWidth={1} />)}
          {crossover === -1 && <rect x={0} y={0} width={W} height={H} fill="#dcfce7" opacity={0.4} />}
          {crossover > 0 && <rect x={toX(crossover)} y={0} width={W - toX(crossover)} height={H} fill="#dcfce7" opacity={0.4} />}
          <line x1={0} y1={qaY} x2={W} y2={qaY} stroke="#7c3aed" strokeWidth={2} strokeDasharray="6 3" />
          <polyline points={psoPoints} fill="none" stroke="#2563eb" strokeWidth={2.5} strokeLinejoin="round" />
          {crossover >= 0 && crossover < psoData.length && (
            <g transform={`translate(${toX(crossover)},${toY(psoData[crossover])})`}>
              <circle r={5} fill="#16a34a" />
              <text x={8} y={-6} fontSize={11} fill="#16a34a" fontWeight={700}>PSO beats QAOA @ iter {crossover}</text>
            </g>
          )}
          {yTicks.map(({ v, y }, i) => (
            <g key={i}>
              <line x1={-4} y1={y} x2={0} y2={y} stroke="#9ca3af" />
              <text x={-8} y={y + 4} textAnchor="end" fontSize={11} fill="#6b7280">{v.toFixed(1)}</text>
            </g>
          ))}
          {xTicks.map(i => (
            <g key={i} transform={`translate(${toX(i)},${H})`}>
              <line x1={0} y1={0} x2={0} y2={4} stroke="#9ca3af" />
              <text x={0} y={16} textAnchor="middle" fontSize={11} fill="#6b7280">{i}</text>
            </g>
          ))}
          <text x={W / 2} y={H + 40} textAnchor="middle" fontSize={12} fill="#374151">Iteration</text>
          <text x={-(H / 2)} y={-46} textAnchor="middle" fontSize={12} fill="#374151" transform="rotate(-90)">Distance (km)</text>
          <g transform={`translate(${W - 160}, 0)`}>
            <line x1={0} y1={8} x2={20} y2={8} stroke="#2563eb" strokeWidth={2.5} />
            <text x={26} y={12} fontSize={12} fill="#374151">PSO convergence</text>
            <line x1={0} y1={26} x2={20} y2={26} stroke="#7c3aed" strokeWidth={2} strokeDasharray="6 3" />
            <text x={26} y={30} fontSize={12} fill="#374151">QAOA final</text>
          </g>
          <line x1={0} y1={0} x2={0} y2={H} stroke="#9ca3af" />
          <line x1={0} y1={H} x2={W} y2={H} stroke="#9ca3af" />
        </g>
      </svg>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function Comparison() {
  const navigate = useNavigate();
  const [locations, setLocations] = useState([
    { name: '', lat: '', lng: '' },
    { name: '', lat: '', lng: '' },
    { name: '', lat: '', lng: '' },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');
  const [data, setData]     = useState(null);

  const addLocation    = () => setLocations(p => [...p, { name: '', lat: '', lng: '' }]);
  const removeLocation = (i) => setLocations(p => p.filter((_, idx) => idx !== i));
  const updateLocation = (i, field, value) =>
    setLocations(p => p.map((l, idx) => idx === i ? { ...l, [field]: value } : l));

  const addPreset = (preset) => {
    if (locations.some(l => l.name === preset.name)) return;
    setLocations(prev => {
      const blank = prev.findIndex(l => !l.name && !l.lat && !l.lng);
      if (blank !== -1)
        return prev.map((l, i) => i === blank ? { name: preset.name, lat: String(preset.lat), lng: String(preset.lng) } : l);
      return [...prev, { name: preset.name, lat: String(preset.lat), lng: String(preset.lng) }];
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
      const result = await compareCustom(payload);
      setData(result);
    } catch (err) {
      if (err.response?.status === 401) { clearToken(); navigate('/login'); return; }
      setError(err.response?.data?.detail || err.response?.data?.error || 'Comparison failed.');
    } finally {
      setLoading(false);
    }
  }, [locations, navigate]);

  const psoWins = data && data.pso.distance_km <= data.qaoa.distance_km;

  return (
    <div className="page-wrap" style={{ paddingTop: 28 }}>
      <h2 style={{ fontWeight: 800, marginBottom: 4 }}>PSO vs QAOA Comparison</h2>
      <p style={{ color: 'var(--text-3)', fontSize: 14, marginBottom: 24 }}>
        Enter locations, run both solvers, and compare their routes and convergence.
      </p>

      {/* ── Location input ── */}
      <div style={{ display: 'grid', gridTemplateColumns: data ? '1fr 2fr' : '1fr', gap: 24 }}>
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
              <div className="section-title" style={{ marginBottom: 12 }}>Locations</div>
              {locations.map((loc, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 90px auto', gap: 8, marginBottom: 10, alignItems: 'end' }}>
                  <div className="input-group" style={{ marginBottom: 0 }}>
                    {i === 0 && <label style={{ fontSize: 11 }}>Name</label>}
                    <input type="text" placeholder={`Stop ${i + 1}`} value={loc.name} onChange={e => updateLocation(i, 'name', e.target.value)} />
                  </div>
                  <div className="input-group" style={{ marginBottom: 0 }}>
                    {i === 0 && <label style={{ fontSize: 11 }}>Lat</label>}
                    <input type="number" step="any" placeholder="-1.27" value={loc.lat} onChange={e => updateLocation(i, 'lat', e.target.value)} />
                  </div>
                  <div className="input-group" style={{ marginBottom: 0 }}>
                    {i === 0 && <label style={{ fontSize: 11 }}>Lng</label>}
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
              {error && <div className="error-box" style={{ marginBottom: 12 }}>{error}</div>}
              <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
                {loading ? 'Running both solvers…' : '▶ Run comparison'}
              </button>
            </div>
          </form>
        </div>

        {/* ── Results ── */}
        {data && (
          <div>
            {/* Metric cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
              {[
                { label: 'PSO Distance',    value: `${data.pso.distance_km} km`,  color: '#2563eb', sub: `${data.pso.runtime_s}s · quality ${data.pso_quality_pct}%` },
                { label: 'QAOA Distance',   value: `${data.qaoa.distance_km} km`, color: '#7c3aed', sub: `${data.qaoa.runtime_s}s · quality ${data.qaoa_quality_pct}%` },
                { label: 'Optimal (exact)', value: `${data.optimal_distance_km} km`, color: '#16a34a', sub: 'Brute-force reference' },
                { label: 'Winner',          value: psoWins ? 'PSO' : 'QAOA', color: psoWins ? '#2563eb' : '#7c3aed',
                  sub: `by ${Math.abs(data.pso.distance_km - data.qaoa.distance_km).toFixed(2)} km` },
              ].map(({ label, value, color, sub }) => (
                <div key={label} className="card" style={{ borderTop: `3px solid ${color}`, paddingTop: 12 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color }}>{value}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{sub}</div>
                </div>
              ))}
            </div>

            {/* Convergence chart */}
            {data.pso.convergence && data.pso.convergence.length > 0 && (
              <div className="card" style={{ marginBottom: 20 }}>
                <div className="section-title" style={{ marginBottom: 4 }}>PSO Convergence vs QAOA Final</div>
                <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 16 }}>
                  Blue line = PSO improving each iteration. Dashed purple = QAOA's final answer.
                </p>
                <ConvergenceChart psoData={data.pso.convergence} qaoaFinal={data.qaoa.distance_km} width={580} height={300} />
                {data.note && <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 12, fontStyle: 'italic' }}>{data.note}</p>}
              </div>
            )}

            {/* Route lists */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {[
                { label: 'PSO Route',  route: data.pso.route,  color: '#2563eb' },
                { label: 'QAOA Route', route: data.qaoa.route, color: '#7c3aed' },
              ].map(({ label, route, color }) => (
                <div key={label} className="card">
                  <div className="section-title" style={{ marginBottom: 10, color }}>{label}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {route.map((stop, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ background: color, color: '#fff', borderRadius: '50%', width: 22, height: 22,
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{i + 1}</span>
                        <span style={{ fontSize: 14 }}>{stop}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 12 }}>
              Generated at: {new Date(data.generated_at).toLocaleString()}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
