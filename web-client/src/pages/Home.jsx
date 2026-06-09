import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getSubmissions, getRewards, clearToken } from '../services/api';
import SubmissionCard from '../components/SubmissionCard';

export default function Home() {
  const navigate = useNavigate();
  const [submissions, setSubmissions] = useState([]);
  const [totals, setTotals] = useState({ total_received: '0', total_earned: '0' });
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const [subData, rewData] = await Promise.all([
        getSubmissions(1, 5),
        getRewards(1, 1),
      ]);
      setSubmissions(subData.submissions || []);
      setTotalCount(subData.pagination?.total || 0);
      setTotals(rewData.totals || {});
    } catch (err) {
      if (err.response?.status === 401) { clearToken(); navigate('/login'); return; }
      setError('Failed to load dashboard data.');
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="page-wrap-wide" style={{ paddingTop: 28 }}>
      {error && <div className="error-box">{error}</div>}

      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
        <div className="stat-card">
          <div className="stat-label">Tokens Received</div>
          <div>
            <span className="token-amount stat-value">{Number(totals.total_received || 0).toFixed(2)}</span>
            <span className="token-symbol">WWT</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Earned</div>
          <div>
            <span className="token-amount stat-value">{Number(totals.total_earned || 0).toFixed(2)}</span>
            <span className="token-symbol">WWT</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Submissions</div>
          <div className="stat-value">{totalCount}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
        <Link to="/submit" className="btn btn-primary btn-lg" style={{ flex: 1, minWidth: 140 }}>+ Submit Waste</Link>
        <Link to="/rewards" className="btn btn-secondary btn-lg" style={{ flex: 1, minWidth: 140 }}>My Rewards</Link>
        <Link to="/map" className="btn btn-secondary btn-lg" style={{ flex: 1, minWidth: 140 }}>Collection Map</Link>
      </div>

      <div className="section-title">Recent Submissions</div>

      {loading ? (
        <div className="spinner" />
      ) : submissions.length === 0 ? (
        <div className="list-empty">No submissions yet. Submit your first waste photo!</div>
      ) : (
        <>
          {submissions.map(s => <SubmissionCard key={s.id} submission={s} />)}
          {totalCount > 5 && (
            <p style={{ fontSize: 14, color: 'var(--text-3)', textAlign: 'center', marginTop: 8 }}>
              Showing 5 of {totalCount} submissions
            </p>
          )}
        </>
      )}
    </div>
  );
}
