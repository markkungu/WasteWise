import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getRewards, clearToken } from '../services/api';

export default function Rewards() {
  const navigate = useNavigate();
  const [rewards, setRewards] = useState([]);
  const [totals, setTotals] = useState({});
  const [pagination, setPagination] = useState({});
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (p = 1, append = false) => {
    if (p === 1) setLoading(true); else setLoadingMore(true);
    try {
      const data = await getRewards(p, 20);
      setRewards(prev => append ? [...prev, ...(data.rewards || [])] : (data.rewards || []));
      setTotals(data.totals || {});
      setPagination(data.pagination || {});
    } catch (err) {
      if (err.response?.status === 401) { clearToken(); navigate('/login'); return; }
      setError('Failed to load rewards.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [navigate]);

  useEffect(() => { load(1); }, [load]);

  function loadMore() {
    const next = page + 1;
    setPage(next);
    load(next, true);
  }

  const statusInfo = (status) => ({
    PARTIAL: { label: '30% Pending', cls: 'badge-yellow' },
    COMPLETED: { label: 'Complete', cls: 'badge-green' },
    FAILED: { label: 'Failed', cls: 'badge-red' },
  }[status] || { label: status, cls: 'badge-gray' });

  return (
    <div className="page-wrap" style={{ paddingTop: 28 }}>
      <h2 style={{ fontWeight: 800, marginBottom: 16 }}>My Rewards</h2>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Received', val: totals.total_received },
          { label: 'Pending', val: totals.total_pending },
          { label: 'Total Earned', val: totals.total_earned },
        ].map(({ label, val }) => (
          <div key={label} className="stat-card" style={{ textAlign: 'center' }}>
            <div className="stat-label">{label}</div>
            <div>
              <span className="token-amount" style={{ fontSize: 20 }}>{Number(val || 0).toFixed(2)}</span>
              <span className="token-symbol">WWT</span>
            </div>
          </div>
        ))}
      </div>

      {error && <div className="error-box">{error}</div>}

      {loading ? (
        <div className="spinner" />
      ) : rewards.length === 0 ? (
        <div className="list-empty">No rewards yet. Submit plastic waste to start earning!</div>
      ) : (
        <>
          {rewards.map(r => {
            const si = statusInfo(r.status);
            const date = new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            return (
              <div key={r.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>{r.waste_type || 'Plastic Waste'}</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span className={`badge ${si.cls}`}>{si.label}</span>
                    <span style={{ fontSize: 13, color: 'var(--text-3)' }}>{date}</span>
                    {r.reported_weight_kg && <span style={{ fontSize: 13, color: 'var(--text-3)' }}>{Number(r.reported_weight_kg).toFixed(2)} kg</span>}
                  </div>
                  {r.status === 'PARTIAL' && r.pending_amount && (
                    <div style={{ fontSize: 13, color: 'var(--yellow-text)', marginTop: 4 }}>
                      +{Number(r.pending_amount).toFixed(2)} WWT pending on collection
                    </div>
                  )}
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                  <span className="token-amount" style={{ fontSize: 20 }}>{Number(r.immediate_amount || r.token_amount || 0).toFixed(2)}</span>
                  <span className="token-symbol">WWT</span>
                </div>
              </div>
            );
          })}

          {pagination.page < pagination.total_pages && (
            <button className="btn btn-secondary btn-full" onClick={loadMore} disabled={loadingMore} style={{ marginTop: 4 }}>
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          )}
        </>
      )}
    </div>
  );
}
