import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getComparison, optimizeRoutes, clearToken } from '../services/api';

// ── SVG Convergence Chart ────────────────────────────────────────────────────

function ConvergenceChart({ psoData, qaoa_distance_km, width = 600, height = 300 }) {
  if (!psoData || psoData.length === 0) return null;

  const PAD = { top: 20, right: 20, bottom: 48, left: 60 };
  const W = width - PAD.left - PAD.right;
  const H = height - PAD.top - PAD.bottom;

  const allValues = [...psoData, qaoa_distance_km];
  const minY = Math.min(...allValues) * 0.97;
  const maxY = Math.max(...allValues) * 1.03;
  const maxX = psoData.length - 1;

  const toX = (i) => (i / Math.max(maxX, 1)) * W;
  const toY = (v) => H - ((v - minY) / (maxY - minY)) * H;

  // PSO polyline points
  const psoPoints = psoData.map((v, i) => `${toX(i)},${toY(v)}`).join(' ');

  // QAOA flat line
  const qaY = toY(qaoa_distance_km);

  // Find crossover: first index where PSO <= QAOA
  const crossover = psoData.findIndex(v => v <= qaoa_distance_km);

  // Y-axis ticks
  const tickCount = 5;
  const yTicks = Array.from({ length: tickCount }, (_, i) => {
    const v = minY + ((maxY - minY) * i) / (tickCount - 1);
    return { v, y: toY(v) };
  });

  // X-axis ticks
  const xTickStep = Math.ceil(psoData.length / 6);
  const xTicks = psoData
    .map((_, i) => i)
    .filter(i => i === 0 || i === psoData.length - 1 || i % xTickStep === 0);

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={width} height={height} style={{ display: 'block', maxWidth: '100%' }}>
        <g transform={`translate(${PAD.left},${PAD.top})`}>

          {/* Grid lines */}
          {yTicks.map(({ y }, i) => (
            <line key={i} x1={0} y1={y} x2={W} y2={y} stroke="#e5e7eb" strokeWidth={1} />
          ))}

          {/* Shaded region where QAOA < PSO (QAOA wins zone) */}
          {crossover === -1 && (
            <rect x={0} y={0} width={W} height={H} fill="#dcfce7" opacity={0.4} />
          )}
          {crossover > 0 && (
            <rect x={toX(crossover)} y={0} width={W - toX(crossover)} height={H} fill="#dcfce7" opacity={0.4} />
          )}

          {/* QAOA flat line */}
          <line
            x1={0} y1={qaY} x2={W} y2={qaY}
            stroke="#7c3aed" strokeWidth={2} strokeDasharray="6 3"
          />

          {/* PSO convergence line */}
          <polyline points={psoPoints} fill="none" stroke="#2563eb" strokeWidth={2.5} strokeLinejoin="round" />

          {/* Crossover marker */}
          {crossover >= 0 && crossover < psoData.length && (
            <g transform={`translate(${toX(crossover)},${toY(psoData[crossover])})`}>
              <circle r={5} fill="#16a34a" />
              <text x={8} y={-6} fontSize={11} fill="#16a34a" fontWeight={700}>
                PSO beats QAOA @ iter {crossover}
              </text>
            </g>
          )}

          {/* Y-axis ticks & labels */}
          {yTicks.map(({ v, y }, i) => (
            <g key={i}>
              <line x1={-4} y1={y} x2={0} y2={y} stroke="#9ca3af" />
              <text x={-8} y={y + 4} textAnchor="end" fontSize={11} fill="#6b7280">
                {v.toFixed(1)}
              </text>
            </g>
          ))}

          {/* X-axis ticks & labels */}
          {xTicks.map(i => (
            <g key={i} transform={`translate(${toX(i)},${H})`}>
              <line x1={0} y1={0} x2={0} y2={4} stroke="#9ca3af" />
              <text x={0} y={16} textAnchor="middle" fontSize={11} fill="#6b7280">{i}</text>
            </g>
          ))}

          {/* Axis labels */}
          <text x={W / 2} y={H + 40} textAnchor="middle" fontSize={12} fill="#374151">Iteration</text>
          <text
            x={-(H / 2)}
            y={-46}
            textAnchor="middle"
            fontSize={12}
            fill="#374151"
            transform="rotate(-90)"
          >
            Distance (km)
          </text>

          {/* Legend */}
          <g transform={`translate(${W - 160}, 0)`}>
            <line x1={0} y1={8} x2={20} y2={8} stroke="#2563eb" strokeWidth={2.5} />
            <text x={26} y={12} fontSize={12} fill="#374151">PSO (convergence)</text>
            <line x1={0} y1={26} x2={20} y2={26} stroke="#7c3aed" strokeWidth={2} strokeDasharray="6 3" />
            <text x={26} y={30} fontSize={12} fill="#374151">QAOA (final)</text>
            {crossover >= 0 && (
              <>
                <rect x={0} y={40} width={14} height={14} fill="#dcfce7" stroke="#16a34a" strokeWidth={1} />
                <text x={20} y={51} fontSize={11} fill="#374151">QAOA wins zone</text>
              </>
            )}
          </g>

          {/* Axes */}
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
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');

  const loadComparison = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const d = await getComparison();
      setData(d);
    } catch (err) {
      if (err.response?.status === 401) { clearToken(); navigate('/login'); return; }
      if (err.response?.status === 404) setError('No comparison data yet — run an optimization first.');
      else setError('Failed to load comparison data.');
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  const runOptimization = useCallback(async () => {
    setRunning(true);
    setError('');
    try {
      await optimizeRoutes('both', []);
      await loadComparison();
    } catch (err) {
      if (err.response?.status === 401) { clearToken(); navigate('/login'); return; }
      if (err.response?.status === 403) setError('Only admins can trigger optimization runs.');
      else setError(err.response?.data?.error || 'Optimization failed.');
    } finally {
      setRunning(false);
    }
  }, [navigate, loadComparison]);

  const psoWins = data && data.pso_distance_km <= data.qaoa_distance_km;

  return (
    <div className="page-wrap" style={{ paddingTop: 28 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontWeight: 800, marginBottom: 4 }}>PSO vs QAOA Comparison</h2>
          <p style={{ color: 'var(--text-3)', fontSize: 14 }}>
            Compare algorithm performance on the standard Nairobi waste-collection graph.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={loadComparison} disabled={loading}>
            {loading ? 'Loading…' : '↺ Load latest'}
          </button>
          <button className="btn btn-primary btn-sm" onClick={runOptimization} disabled={running || loading}>
            {running ? 'Running both solvers…' : '▶ Run comparison'}
          </button>
        </div>
      </div>

      {error && <div className="error-box" style={{ marginBottom: 16 }}>{error}</div>}

      {!data && !loading && !error && (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)' }}>
          Click <strong>Load latest</strong> to fetch cached results, or <strong>Run comparison</strong> to trigger a fresh run.
        </div>
      )}

      {data && (
        <>
          {/* ── Metric cards ─────────────────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
            {[
              { label: 'PSO Distance', value: `${data.pso_distance_km} km`, color: '#2563eb', sub: `${data.pso_runtime_s}s · quality ${data.pso_quality_pct}%` },
              { label: 'QAOA Distance', value: `${data.qaoa_distance_km} km`, color: '#7c3aed', sub: `${data.qaoa_runtime_s}s · quality ${data.qaoa_quality_pct}%` },
              { label: 'Optimal (exact)', value: `${data.optimal_distance_km} km`, color: '#16a34a', sub: 'Brute-force reference' },
              { label: 'Winner', value: psoWins ? 'PSO' : 'QAOA', color: psoWins ? '#2563eb' : '#7c3aed', sub: `by ${Math.abs(data.pso_distance_km - data.qaoa_distance_km).toFixed(2)} km` },
            ].map(({ label, value, color, sub }) => (
              <div key={label} className="card" style={{ borderTop: `3px solid ${color}`, paddingTop: 12 }}>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color }}>{value}</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{sub}</div>
              </div>
            ))}
          </div>

          {/* ── Convergence graph ─────────────────────────────────────────── */}
          {data.pso_convergence && data.pso_convergence.length > 0 && (
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="section-title" style={{ marginBottom: 4 }}>PSO Convergence vs QAOA Final Solution</div>
              <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 16 }}>
                The blue line shows PSO improving iteration by iteration. The dashed purple line is QAOA's final answer.
                The green shaded region shows where QAOA outperforms the current PSO best.
              </p>
              <ConvergenceChart
                psoData={data.pso_convergence}
                qaoa_distance_km={data.qaoa_distance_km}
                width={680}
                height={320}
              />
              {data.note && (
                <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 12, fontStyle: 'italic' }}>{data.note}</p>
              )}
            </div>
          )}

          {/* ── Routes ────────────────────────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {[
              { label: 'PSO Route', route: data.pso_route, color: '#2563eb' },
              { label: 'QAOA Route', route: data.qaoa_route, color: '#7c3aed' },
            ].map(({ label, route, color }) => (
              <div key={label} className="card">
                <div className="section-title" style={{ marginBottom: 10, color }}>{label}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {route.map((stop, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ background: color, color: '#fff', borderRadius: '50%', width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{i + 1}</span>
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
        </>
      )}
    </div>
  );
}
