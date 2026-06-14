import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

// ── Mock analytics data ───────────────────────────────────────────────────────

const MONTHLY = {
  labels:   ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'],
  volume:   [1200, 1480, 1820, 2100, 2380, 2650],   // total kg collected
  verified: [140,  175,  210,  255,  290,  320],     // verified submissions
};

const PEAK_HOURS = [
  { h: '8am',  v: 12 }, { h: '9am',  v: 15 }, { h: '10am', v: 19 },
  { h: '11am', v: 22 }, { h: '12pm', v: 25 }, { h: '1pm',  v: 23 },
  { h: '2pm',  v: 20 }, { h: '4pm',  v: 15 }, { h: '6pm',  v: 9  },
  { h: '8pm',  v: 4  },
];

const AREAS = [
  { name: 'Westlands',       n: 98  },
  { name: 'CBD',             n: 112 },
  { name: 'Industrial Area', n: 87  },
  { name: 'Eastlands',       n: 73  },
  { name: 'Langata',         n: 65  },
  { name: 'Kasarani',        n: 58  },
];

const PLASTIC_DIST = [
  { label: 'PET Bottles', pct: 42, color: '#16a34a' },
  { label: 'HDPE',        pct: 22, color: '#2563eb' },
  { label: 'LDPE Film',   pct: 15, color: '#f59e0b' },
  { label: 'PP',          pct: 12, color: '#6366f1' },
  { label: 'Mixed',       pct:  9, color: '#9ca3af' },
];

const SEED_HISTORY = [
  { weightKg: 3.2, tokens: 32, status: 'Verified'       },
  { weightKg: 1.8, tokens: 18, status: 'Verified'       },
  { weightKg: 0.9, tokens: 0,  status: 'Pending Review' },
  { weightKg: 2.1, tokens: 21, status: 'Verified'       },
];

function loadHistory() {
  try { const s = localStorage.getItem('wastewise_submissions'); if (s) return JSON.parse(s); } catch {}
  return SEED_HISTORY;
}

// ── SVG Charts ────────────────────────────────────────────────────────────────

function AreaChart() {
  const VW = 560, VH = 220;
  const P = { t: 16, r: 16, b: 36, l: 46 };
  const W = VW - P.l - P.r, H = VH - P.t - P.b;
  const maxV = Math.max(...MONTHLY.volume) * 1.12;
  const tx = i => (i / (MONTHLY.labels.length - 1)) * W;
  const ty = v => H - (v / maxV) * H;
  const volPts  = MONTHLY.volume.map((v, i)   => `${tx(i)},${ty(v)}`).join(' ');
  const verPts  = MONTHLY.verified.map((v, i) => `${tx(i)},${ty(v)}`).join(' ');
  const n = MONTHLY.labels.length - 1;
  const volArea = `${tx(0)},${H} ${volPts} ${tx(n)},${H}`;
  const verArea = `${tx(0)},${H} ${verPts} ${tx(n)},${H}`;
  const yTicks  = [0, 700, 1400, 2100, 2800].map(v => ({ v, y: ty(v) }));

  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} style={{ width: '100%', display: 'block' }}>
      <defs>
        <linearGradient id="gOrange" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#f59e0b" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.03" />
        </linearGradient>
        <linearGradient id="gGreen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#16a34a" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#16a34a" stopOpacity="0.05" />
        </linearGradient>
      </defs>
      <g transform={`translate(${P.l},${P.t})`}>
        {yTicks.map(({ y }, i) => <line key={i} x1={0} y1={y} x2={W} y2={y} stroke="#e5e7eb" strokeWidth={1} />)}
        <polygon points={volArea}  fill="url(#gOrange)" />
        <polygon points={verArea}  fill="url(#gGreen)" />
        <polyline points={volPts}  fill="none" stroke="#f59e0b" strokeWidth={2.5} strokeLinejoin="round" />
        <polyline points={verPts}  fill="none" stroke="#16a34a" strokeWidth={2}   strokeLinejoin="round" />
        {yTicks.map(({ v, y }, i) => (
          <text key={i} x={-6} y={y + 4} textAnchor="end" fontSize={11} fill="#9ca3af">{v}</text>
        ))}
        {MONTHLY.labels.map((l, i) => (
          <text key={i} x={tx(i)} y={H + 18} textAnchor="middle" fontSize={11} fill="#6b7280">{l}</text>
        ))}
        <line x1={0} y1={0} x2={0} y2={H} stroke="#e5e7eb" />
        <line x1={0} y1={H} x2={W} y2={H} stroke="#e5e7eb" />
        {/* Legend */}
        <g transform={`translate(${W - 200}, 4)`}>
          <line x1={0} y1={8} x2={18} y2={8} stroke="#f59e0b" strokeWidth={2.5} />
          <text x={22} y={12} fontSize={11} fill="#374151">Total volume (kg)</text>
          <line x1={0} y1={22} x2={18} y2={22} stroke="#16a34a" strokeWidth={2} />
          <text x={22} y={26} fontSize={11} fill="#374151">Verified submissions</text>
        </g>
      </g>
    </svg>
  );
}

function BarChart() {
  const VW = 300, VH = 190;
  const P = { t: 8, r: 8, b: 28, l: 28 };
  const W = VW - P.l - P.r, H = VH - P.t - P.b;
  const maxV = Math.max(...PEAK_HOURS.map(d => d.v));
  const bW   = W / PEAK_HOURS.length * 0.62;
  const gap  = W / PEAK_HOURS.length;

  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} style={{ width: '100%', display: 'block' }}>
      <g transform={`translate(${P.l},${P.t})`}>
        {PEAK_HOURS.map((d, i) => {
          const bH = (d.v / maxV) * H;
          const x  = i * gap + (gap - bW) / 2;
          return (
            <g key={i}>
              <rect x={x} y={H - bH} width={bW} height={bH} fill="#16a34a" rx={2} />
              <text x={x + bW / 2} y={H + 14} textAnchor="middle" fontSize={9} fill="#9ca3af">{d.h}</text>
            </g>
          );
        })}
        <line x1={0} y1={H} x2={W} y2={H} stroke="#e5e7eb" />
      </g>
    </svg>
  );
}

function HBarChart() {
  const VW = 300, VH = 200;
  const P = { t: 8, r: 32, b: 8, l: 100 };
  const W = VW - P.l - P.r, H = VH - P.t - P.b;
  const maxV = Math.max(...AREAS.map(a => a.n));
  const bH   = H / AREAS.length * 0.58;
  const gap  = H / AREAS.length;

  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} style={{ width: '100%', display: 'block' }}>
      <g transform={`translate(${P.l},${P.t})`}>
        {AREAS.map((a, i) => {
          const bW = (a.n / maxV) * W;
          const y  = i * gap + (gap - bH) / 2;
          return (
            <g key={i}>
              <text x={-6} y={y + bH / 2 + 4} textAnchor="end" fontSize={10} fill="#6b7280">{a.name}</text>
              <rect x={0} y={y} width={bW} height={bH} fill="#16a34a" rx={2} />
              <text x={bW + 4} y={y + bH / 2 + 4} fontSize={10} fill="#9ca3af">{a.n}</text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}

function DonutChart() {
  const size = 150, r = 50;
  const cx = size / 2, cy = size / 2;
  const circ = 2 * Math.PI * r;
  let cum = 0;

  return (
    <svg viewBox={`0 0 ${size} ${size}`} style={{ width: 150, height: 150, display: 'block', margin: '0 auto' }}>
      {PLASTIC_DIST.map((seg, i) => {
        const dash  = (seg.pct / 100) * circ;
        const angle = (cum / 100) * 360 - 90;
        cum += seg.pct;
        return (
          <circle key={i} cx={cx} cy={cy} r={r}
            fill="none" stroke={seg.color} strokeWidth={22}
            strokeDasharray={`${dash} ${circ}`}
            transform={`rotate(${angle}, ${cx}, ${cy})`}
          />
        );
      })}
      <circle cx={cx} cy={cy} r={r - 22} fill="#fff" />
    </svg>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Home() {
  const [history, setHistory] = useState([]);

  useEffect(() => {
    setHistory(loadHistory());
    const onFocus = () => setHistory(loadHistory());
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  const verified      = history.filter(h => h.status === 'Verified');
  const totalWeight   = history.reduce((s, h) => s + (h.weightKg || 0), 0);
  const totalTokens   = verified.reduce((s, h) => s + (h.tokens   || 0), 0);
  const recyclingRate = history.length ? Math.round((verified.length / history.length) * 100) : 78;
  const co2Offset     = (totalWeight * 2.6 / 1000).toFixed(1); // ~2.6 kg CO₂ per kg plastic
  const plasticDiverted = (totalWeight + 1200).toFixed(0);     // seeded base + actual

  const IMPACT = [
    { label: 'Plastic diverted from landfills', value: `${plasticDiverted} kg`, pct: Math.min(98, 60 + totalWeight * 2) },
    { label: 'CO₂ emissions prevented',         value: `${co2Offset} tons`,    pct: 68 },
    { label: 'Ocean pollution prevented',        value: '890 kg',               pct: 74 },
    { label: 'Community participation rate',     value: `${recyclingRate}%`,    pct: recyclingRate },
  ];

  const gridTwo = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 16 };

  return (
    <div className="page-wrap-wide" style={{ paddingTop: 28 }}>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontWeight: 800, marginBottom: 2 }}>Analytics</h2>
        <p style={{ color: 'var(--text-3)', fontSize: 14 }}>Collection trends, predictions, and environmental impact</p>
      </div>

      {/* Top stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
        {[
          { label: 'Monthly Growth', value: '+15.3%',          icon: '↗', color: '#16a34a' },
          { label: 'Recycling Rate', value: `${recyclingRate}%`, icon: '◎', color: '#2563eb' },
          { label: 'CO₂ Offset',    value: `${co2Offset} tons`, icon: '🌿', color: '#16a34a', sub: 'This month' },
          { label: 'Peak Hour',      value: '12 PM',            icon: '⚡', color: '#f59e0b', sub: 'Most active collection time' },
        ].map(({ label, value, icon, color, sub }) => (
          <div key={label} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6 }}>{label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
              {sub && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>{sub}</div>}
            </div>
            <span style={{
              fontSize: 18, width: 36, height: 36,
              background: '#f0fdf4', borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>{icon}</span>
          </div>
        ))}
      </div>

      {/* Monthly Collection Trends */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-title" style={{ marginBottom: 12 }}>Monthly Collection Trends</div>
        <AreaChart />
      </div>

      {/* Peak Hours + Collections by Area */}
      <div style={gridTwo}>
        <div className="card">
          <div className="section-title" style={{ marginBottom: 10 }}>Peak Collection Hours</div>
          <BarChart />
        </div>
        <div className="card">
          <div className="section-title" style={{ marginBottom: 10 }}>Collections by Area</div>
          <HBarChart />
        </div>
      </div>

      {/* Plastic Type Distribution + Environmental Impact */}
      <div style={gridTwo}>
        <div className="card">
          <div className="section-title" style={{ marginBottom: 14 }}>Plastic Type Distribution</div>
          <DonutChart />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 14 }}>
            {PLASTIC_DIST.map(seg => (
              <div key={seg.label} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: seg.color, flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{seg.label}: <strong>{seg.pct}%</strong></span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="section-title" style={{ marginBottom: 14 }}>Environmental Impact</div>
          {IMPACT.map(({ label, value, pct }) => (
            <div key={label} style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{label}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{value}</span>
              </div>
              <div style={{ height: 8, background: '#e5e7eb', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 4, background: '#16a34a',
                  width: `${pct}%`, transition: 'width 0.8s ease',
                }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick actions */}
      <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
        <Link to="/submit"  className="btn btn-primary"   style={{ flex: 1 }}>+ Submit Waste</Link>
        <Link to="/rewards" className="btn btn-secondary" style={{ flex: 1 }}>My Rewards</Link>
      </div>

    </div>
  );
}
