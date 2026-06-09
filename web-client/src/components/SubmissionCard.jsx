export default function SubmissionCard({ submission }) {
  const {
    waste_type, verification_status, created_at,
    reported_weight_kg, confidence_score, token_amount,
  } = submission;

  const statusInfo = {
    APPROVED: { label: 'Approved', cls: 'badge-green' },
    PENDING: { label: 'Pending', cls: 'badge-yellow' },
    REJECTED_SPOOF: { label: 'Rejected — Spoof', cls: 'badge-red' },
    REJECTED_INVALID_MATERIAL: { label: 'Rejected — No Plastic', cls: 'badge-red' },
    REJECTED_LOW_QUALITY: { label: 'Rejected — Low Quality', cls: 'badge-red' },
  }[verification_status] || { label: verification_status || 'Unknown', cls: 'badge-gray' };

  const date = new Date(created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
      <div>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>{waste_type || 'Plastic Waste'}</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className={`badge ${statusInfo.cls}`}>{statusInfo.label}</span>
          <span style={{ fontSize: 13, color: 'var(--text-3)' }}>{date}</span>
          {reported_weight_kg && <span style={{ fontSize: 13, color: 'var(--text-3)' }}>{Number(reported_weight_kg).toFixed(2)} kg</span>}
          {confidence_score && <span style={{ fontSize: 13, color: 'var(--text-3)' }}>{Math.round(confidence_score * 100)}% confidence</span>}
        </div>
      </div>
      {verification_status === 'APPROVED' && token_amount && (
        <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
          <span className="token-amount" style={{ fontSize: 18 }}>{Number(token_amount).toFixed(2)}</span>
          <span className="token-symbol">WWT</span>
        </div>
      )}
    </div>
  );
}
