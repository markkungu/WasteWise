import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

const SEED_HISTORY = [
  { id: 'WW-2026-10001', collectorName: 'Antony Omondi',  walletAddress: '0x7F3a...9Bc4', plasticType: 'PET',  weightKg: 3.2, locationLabel: 'Juja, Kiambu County',   confidence: 91.4, itemsDetected: 4, tokens: 32, status: 'Verified',       timestamp: '2 June 2026, 10:23 AM', txHash: '0xd1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4' },
  { id: 'WW-2026-10002', collectorName: 'Mark Kungu',     walletAddress: '0xA1b2...3Cd4', plasticType: 'HDPE', weightKg: 1.8, locationLabel: 'Thika Road, Nairobi',    confidence: 85.7, itemsDetected: 2, tokens: 18, status: 'Verified',       timestamp: '4 June 2026, 2:45 PM',  txHash: '0xf1e2d3c4b5a6f7e8d9c0b1a2f3e4d5c6b7a8f9e0d1c2b3a4f5e6d7c8b9a0f1e2d3c4' },
  { id: 'WW-2026-10003', collectorName: 'Allan Mutai',    walletAddress: '0xF9e8...7Gh6', plasticType: 'PET',  weightKg: 0.9, locationLabel: 'Eastleigh, Nairobi',    confidence: 63.2, itemsDetected: 1, tokens: 0,  status: 'Pending Review', timestamp: '7 June 2026, 9:10 AM',  txHash: null },
  { id: 'WW-2026-10004', collectorName: 'Antony Omondi',  walletAddress: '0x7F3a...9Bc4', plasticType: 'PVC',  weightKg: 2.1, locationLabel: 'Kibera, Nairobi',       confidence: 88.9, itemsDetected: 3, tokens: 21, status: 'Verified',       timestamp: '9 June 2026, 4:30 PM',  txHash: '0xa1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4' },
];

function loadHistory() {
  try {
    const s = localStorage.getItem('wastewise_submissions');
    if (s) return JSON.parse(s);
  } catch { /* ignore */ }
  return SEED_HISTORY;
}

function truncateHash(h) {
  if (!h) return null;
  return h.slice(0, 8) + '...' + h.slice(-6);
}

export default function Rewards() {
  const [history, setHistory] = useState([]);

  useEffect(() => {
    setHistory(loadHistory());
    function onFocus() { setHistory(loadHistory()); }
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  const verified       = history.filter(h => h.status === 'Verified');
  const pendingItems   = history.filter(h => h.status === 'Pending Review');
  const totalTokens    = verified.reduce((s, h) => s + (h.tokens || 0), 0);
  const pendingTokens  = pendingItems.reduce((s, h) => s + (h.weightKg || 0) * 10, 0); // estimated if approved

  return (
    <div className="page-wrap" style={{ paddingTop: 28 }}>
      <h2 style={{ fontWeight: 800, marginBottom: 16 }}>My Rewards</h2>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Total Earned',   val: totalTokens,         color: '#15803d' },
          { label: 'Pending Review', val: pendingItems.length, color: '#854d0e', unit: 'submissions' },
          { label: 'Verified',       val: verified.length,     color: '#15803d', unit: 'submissions' },
        ].map(({ label, val, color, unit }) => (
          <div key={label} className="stat-card" style={{ textAlign: 'center' }}>
            <div className="stat-label">{label}</div>
            <div style={{ color, fontWeight: 800, fontSize: 20 }}>
              {val}{!unit && <span className="token-symbol"> WWT</span>}
            </div>
            {unit && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{unit}</div>}
          </div>
        ))}
      </div>

      {/* Submit CTA if no rewards yet */}
      {history.length === 0 && (
        <div className="list-empty" style={{ marginBottom: 20 }}>
          No rewards yet.{' '}
          <Link to="/submit" style={{ color: 'var(--green)', fontWeight: 700 }}>Submit plastic waste</Link>
          {' '}to start earning!
        </div>
      )}

      {/* Reward list */}
      {history.length > 0 && (
        <>
          <div className="section-title" style={{ marginBottom: 12 }}>Reward History</div>

          {history.map(item => {
            const isVerified = item.status === 'Verified';
            const immediate  = isVerified ? Math.round(item.tokens * 0.7) : 0;
            const held       = isVerified ? item.tokens - immediate : 0;

            return (
              <div key={item.id} className="card" style={{
                marginBottom: 10,
                borderLeft: `4px solid ${isVerified ? '#16a34a' : '#ca8a04'}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div>
                    <span style={{ fontWeight: 700, fontSize: 15 }}>{item.plasticType}</span>
                    <span style={{ fontSize: 13, color: 'var(--text-3)', marginLeft: 8 }}>{item.weightKg} kg</span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span className="token-amount" style={{ fontSize: 20 }}>{item.tokens}</span>
                    <span className="token-symbol"> WWT</span>
                  </div>
                </div>

                <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 4 }}>
                  📍 {item.locationLabel}
                </div>

                <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 8 }}>
                  {item.collectorName} · {item.timestamp}
                </div>

                {/* Token breakdown for verified */}
                {isVerified && (
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, background: '#dcfce7', color: '#15803d', padding: '3px 8px', borderRadius: 5, fontWeight: 600 }}>
                      {immediate} WWT credited
                    </span>
                    <span style={{ fontSize: 12, background: '#fef9c3', color: '#854d0e', padding: '3px 8px', borderRadius: 5, fontWeight: 600 }}>
                      {held} WWT on collection
                    </span>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className={`badge ${isVerified ? 'badge-green' : 'badge-yellow'}`}>
                    {item.status}
                  </span>
                  {item.txHash && (
                    <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'monospace' }}>
                      tx: {truncateHash(item.txHash)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          <Link to="/submit" className="btn btn-primary btn-full" style={{ marginTop: 8 }}>
            + Submit More Waste
          </Link>
        </>
      )}
    </div>
  );
}
