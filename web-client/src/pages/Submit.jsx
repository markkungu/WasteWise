import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { clearToken } from '../services/api';
import { decodeToken } from '../services/auth';
import { simulateVerification } from '../utils/simulateVerification';

// ── Constants ────────────────────────────────────────────────────────────────

const PLASTIC_TYPES = ['PET', 'HDPE', 'PVC', 'LDPE', 'PP', 'PS'];

const PIPELINE_STEPS = [
  { n: 1, label: 'Upload image' },
  { n: 2, label: 'Pre-process image' },
  { n: 3, label: 'Run YOLOv8 AI detection' },
  { n: 4, label: 'Analyse detection results' },
  { n: 5, label: 'AI decision' },
  { n: 6, label: 'Submit to blockchain' },
  { n: 7, label: 'Complete' },
];

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

function saveHistory(h) {
  try { localStorage.setItem('wastewise_submissions', JSON.stringify(h)); } catch { /* ignore */ }
}

function truncateHash(h) {
  if (!h) return '—';
  return h.slice(0, 8) + '...' + h.slice(-6);
}

function truncateWallet(w) {
  if (!w || w.includes('...')) return w || '—';
  return w.slice(0, 6) + '...' + w.slice(-4);
}

function fmtTimestamp(iso) {
  try {
    return new Date(iso).toLocaleString('en-KE', {
      day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

// ── Sub-components ───────────────────────────────────────────────────────────

function BboxOverlay({ bboxes }) {
  return (
    <>
      {bboxes.map((box, i) => (
        <div key={i} style={{
          position: 'absolute',
          left: `${box.x * 100}%`,
          top: `${box.y * 100}%`,
          width: `${box.w * 100}%`,
          height: `${box.h * 100}%`,
          border: '2.5px solid #16a34a',
          borderRadius: 3,
          boxSizing: 'border-box',
          pointerEvents: 'none',
        }}>
          <span style={{
            position: 'absolute',
            top: -20,
            left: 0,
            background: '#16a34a',
            color: '#fff',
            fontSize: 10,
            fontWeight: 700,
            padding: '2px 6px',
            borderRadius: 3,
            whiteSpace: 'nowrap',
          }}>{box.label} {box.conf}%</span>
        </div>
      ))}
    </>
  );
}

function StepRow({ step, activeStep, uploadProgress, detection, decision, finalData }) {
  const done    = activeStep > step.n || (activeStep === 7 && step.n === 7);
  const active  = activeStep === step.n;

  let icon;
  if (done)        icon = <span style={{ color: '#16a34a', fontWeight: 800, width: 20, flexShrink: 0 }}>✓</span>;
  else if (active) icon = (
    <span style={{
      display: 'inline-block', width: 16, height: 16, flexShrink: 0,
      border: '2px solid #e5e7eb', borderTopColor: '#16a34a',
      borderRadius: '50%', animation: 'spin 0.7s linear infinite',
    }} />
  );
  else             icon = <span style={{ color: '#d1d5db', width: 20, flexShrink: 0 }}>·</span>;

  const textColor = done ? 'var(--text-2)' : active ? 'var(--text)' : 'var(--text-3)';
  const fontWeight = active ? 600 : 400;

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {icon}
        <span style={{ fontSize: 14, color: textColor, fontWeight }}>{step.label}</span>
      </div>

      {/* Step 1: progress bar */}
      {step.n === 1 && (active || done) && (
        <div style={{ marginLeft: 30, marginTop: 6 }}>
          <div style={{ height: 6, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 3, background: '#16a34a',
              width: `${uploadProgress}%`,
              transition: 'width 0.25s ease',
            }} />
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{uploadProgress}%</span>
        </div>
      )}

      {/* Step 3: spinner label */}
      {step.n === 3 && active && (
        <p style={{ marginLeft: 30, marginTop: 4, fontSize: 12, color: 'var(--text-3)' }}>
          Running YOLOv8 plastic detection model…
        </p>
      )}

      {/* Step 4: detection result */}
      {step.n === 4 && (done || active) && detection && (
        <div style={{ marginLeft: 30, marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {[
            ['Confidence', `${detection.confidence}%`],
            ['Items',       detection.itemsDetected],
            ['Weight',     `${detection.verifiedWeight} kg`],
          ].map(([k, v]) => (
            <span key={k} style={{ background: '#f0fdf4', color: '#15803d', fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 5 }}>
              {k}: {v}
            </span>
          ))}
        </div>
      )}

      {/* Step 5: decision */}
      {step.n === 5 && (done || active) && decision && (
        <div style={{ marginLeft: 30, marginTop: 6 }}>
          {decision.verified
            ? <span style={{ fontSize: 13, fontWeight: 700, color: '#16a34a' }}>✅ Verified — {decision.tokens} WWT tokens</span>
            : <span style={{ fontSize: 13, fontWeight: 700, color: '#854d0e' }}>⚠️ Flagged for manual review</span>}
        </div>
      )}

      {/* Step 6: blockchain */}
      {step.n === 6 && active && (
        <p style={{ marginLeft: 30, marginTop: 4, fontSize: 12, color: 'var(--text-3)' }}>
          Submitting verified record to Avalanche blockchain…
        </p>
      )}

      {/* Step 7: tx hash */}
      {step.n === 7 && done && finalData?.txHash && (
        <p style={{ marginLeft: 30, marginTop: 4, fontSize: 11, color: 'var(--text-3)', fontFamily: 'monospace' }}>
          tx: {truncateHash(finalData.txHash)}
        </p>
      )}
    </div>
  );
}

function HistoryCard({ item }) {
  const verified = item.status === 'Verified';
  return (
    <div style={{ borderLeft: `3px solid ${verified ? '#16a34a' : '#854d0e'}`, paddingLeft: 12, marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 2 }}>
        <span style={{ fontWeight: 700, fontSize: 13 }}>{item.collectorName}</span>
        <span className={`badge ${verified ? 'badge-green' : 'badge-yellow'}`}>{item.status}</span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 3 }}>{item.id} · {item.timestamp}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: 12 }}>
        <span>{item.plasticType}</span>
        <span>·</span>
        <span>{item.weightKg} kg</span>
        <span>·</span>
        <span>{item.locationLabel}</span>
        <span>·</span>
        <span>{item.confidence}% conf</span>
        <span>·</span>
        <span style={{ fontWeight: 700, color: verified ? '#16a34a' : 'var(--text-3)' }}>{item.tokens} WWT</span>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function Submit() {
  const navigate  = useNavigate();
  const fileRef   = useRef();

  // Form fields
  const [image,         setImage]         = useState(null);
  const [preview,       setPreview]       = useState(null);
  const [plasticType,   setPlasticType]   = useState('PET');
  const [weight,        setWeight]        = useState('');
  const [locationLabel, setLocationLabel] = useState('');
  const [lat,           setLat]           = useState('');
  const [lng,           setLng]           = useState('');
  const [locLoading,    setLocLoading]    = useState(false);
  const [collectorName, setCollectorName] = useState('');
  const [walletAddress, setWalletAddress] = useState('');
  const [error,         setError]         = useState('');

  // Phase: 'idle' | 'running' | 'done'
  const [phase, setPhase] = useState('idle');

  // Pipeline state
  const [activeStep,     setActiveStep]     = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [detection,      setDetection]      = useState(null);
  const [decision,       setDecision]       = useState(null);
  const [finalResult,    setFinalResult]    = useState(null);
  const [bboxes,         setBboxes]         = useState([]);

  // History
  const [history,      setHistory]      = useState(loadHistory);
  const [showHistory,  setShowHistory]  = useState(false);

  // Pre-fill name from JWT
  useEffect(() => {
    const tok = decodeToken();
    if (tok?.email) setCollectorName(tok.email.split('@')[0]);
  }, []);

  function handleFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    setImage(file);
    setPreview(URL.createObjectURL(file));
    setError('');
  }

  function handleGetLocation() {
    if (!navigator.geolocation) { setError('Geolocation not supported by your browser.'); return; }
    setLocLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude);
        setLng(pos.coords.longitude);
        if (!locationLabel) {
          setLocationLabel(`${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`);
        }
        setLocLoading(false);
      },
      () => { setError('Could not get location. Please allow location access or type it manually.'); setLocLoading(false); }
    );
  }

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (!image)         { setError('Please select a photo.'); return; }
    if (!locationLabel) { setError('Please enter a location name.'); return; }
    const wkg = weight ? Number(weight) : 0.5;
    if (isNaN(wkg) || wkg <= 0) { setError('Weight must be a positive number.'); return; }

    setError('');
    setPhase('running');
    setActiveStep(1);
    setUploadProgress(0);
    setDetection(null);
    setDecision(null);
    setBboxes([]);
    setFinalResult(null);

    try {
      const result = await simulateVerification({
        file:          image,
        weightKg:      wkg,
        plasticType,
        locationLabel,
        collectorName: collectorName || 'Anonymous',
        walletAddress: walletAddress || '0x0000...0000',
        onStep(payload) {
          const { step } = payload;
          setActiveStep(step);
          if (step === 1) setUploadProgress(payload.progress ?? 0);
          if (step === 4) { setDetection(payload); setBboxes(payload.bboxes || []); }
          if (step === 5) setDecision(payload);
          if (step === 7) setFinalResult(payload);
        },
      });

      // Add to history
      const entry = {
        id:            result.submissionId,
        collectorName: result.collectorName,
        walletAddress: truncateWallet(result.walletAddress),
        plasticType:   result.plasticType,
        weightKg:      result.verifiedWeight,
        locationLabel: result.locationLabel,
        confidence:    result.confidence,
        itemsDetected: result.itemsDetected,
        tokens:        result.tokens,
        status:        result.verified ? 'Verified' : 'Pending Review',
        timestamp:     fmtTimestamp(result.timestamp),
        txHash:        result.txHash,
      };
      setHistory(prev => {
        const next = [entry, ...prev];
        saveHistory(next);
        return next;
      });

      setFinalResult(result);
      setPhase('done');
    } catch (err) {
      if (err?.response?.status === 401) { clearToken(); navigate('/login'); return; }
      setError('Simulation error. Please try again.');
      setPhase('idle');
    }
  }, [image, weight, plasticType, locationLabel, collectorName, walletAddress, navigate]);

  function reset() {
    setImage(null); setPreview(null); setWeight(''); setLocationLabel('');
    setLat(''); setLng(''); setError(''); setPhase('idle');
    setActiveStep(0); setUploadProgress(0); setDetection(null);
    setDecision(null); setBboxes([]); setFinalResult(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  // ── Confirmation screen ────────────────────────────────────────────────────
  if (phase === 'done' && finalResult) {
    const verified = finalResult.verified;
    const statusColor = verified ? '#16a34a' : '#854d0e';
    const statusBg    = verified ? '#dcfce7'  : '#fef9c3';
    const rows = [
      ['Submission ID',   finalResult.submissionId],
      ['Collector',       finalResult.collectorName],
      ['Wallet',          truncateWallet(finalResult.walletAddress)],
      ['Plastic type',    finalResult.plasticType],
      ['Verified weight', `${finalResult.verifiedWeight} kg`],
      ['Location',        finalResult.locationLabel],
      ['AI confidence',   `${finalResult.confidence}%`],
      ['Items detected',  finalResult.itemsDetected],
      ['WWT tokens',      `${finalResult.tokens} WWT`],
      finalResult.txHash ? ['Tx hash', truncateHash(finalResult.txHash)] : null,
      ['Timestamp',       fmtTimestamp(finalResult.timestamp)],
    ].filter(Boolean);

    return (
      <div className="page-wrap" style={{ paddingTop: 28 }}>
        <style>{`@media print { .no-print { display: none !important; } body { background: #fff; } }`}</style>

        <div className="receipt-card card" style={{ border: `2px solid ${statusColor}`, marginBottom: 16 }}>
          {/* Status header */}
          <div style={{ textAlign: 'center', marginBottom: 18 }}>
            <div style={{ fontSize: 44, marginBottom: 6 }}>{verified ? '✅' : '⏳'}</div>
            <span style={{
              display: 'inline-block', padding: '5px 18px', borderRadius: 20,
              background: statusBg, color: statusColor, fontWeight: 800, fontSize: 15,
            }}>
              {verified ? 'Verified & Submitted' : 'Pending Review'}
            </span>
          </div>

          {verified && (
            <div style={{ background: '#f0fdf4', borderRadius: 8, padding: '14px 16px', marginBottom: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 4 }}>Tokens Awarded</div>
              <span className="token-amount" style={{ fontSize: 30 }}>{finalResult.tokens}</span>
              <span className="token-symbol"> WWT</span>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
                {Math.round(finalResult.tokens * 0.7)} WWT credited now · {Math.round(finalResult.tokens * 0.3)} WWT released on collection
              </div>
            </div>
          )}

          {!verified && (
            <div style={{ background: '#fef9c3', borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
              <p style={{ color: '#854d0e', fontSize: 13 }}>
                Flagged for manual review. Submission recorded — a human reviewer will confirm within 24 hours.
              </p>
            </div>
          )}

          {/* Summary table */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            {rows.map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f3f4f6' }}>
                <span style={{ fontSize: 13, color: 'var(--text-3)' }}>{k}</span>
                <span style={{ fontSize: 13, fontWeight: 600, maxWidth: '55%', textAlign: 'right', fontFamily: k === 'Tx hash' || k === 'Submission ID' ? 'monospace' : 'inherit' }}>{v}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="no-print" style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => window.print()}>
            🖨 Download Receipt
          </button>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={reset}>
            + Submit Another
          </button>
        </div>

        {/* History below */}
        <div className="no-print">
          <button className="btn btn-secondary btn-full" style={{ marginBottom: 12 }} onClick={() => setShowHistory(s => !s)}>
            {showHistory ? '▲ Hide' : '▼ View'} Submission History ({history.length})
          </button>
          {showHistory && <div className="card">{history.map(h => <HistoryCard key={h.id} item={h} />)}</div>}
        </div>
      </div>
    );
  }

  // ── Running pipeline ───────────────────────────────────────────────────────
  if (phase === 'running') {
    const stepTexts = {
      1: 'Uploading image to verification server…',
      2: 'Pre-processing image: resizing to 640×640, normalising…',
      3: 'Running YOLOv8 plastic detection model…',
      4: 'Analysing bounding boxes and class probabilities…',
      5: 'Applying decision threshold (≥ 70% confidence)…',
      6: 'Submitting verified record to Avalanche blockchain…',
      7: 'Pipeline complete.',
    };

    return (
      <div className="page-wrap" style={{ paddingTop: 28 }}>
        <h2 style={{ fontWeight: 800, marginBottom: 16 }}>Verifying Submission</h2>

        {/* Image + bbox overlay */}
        {preview && (
          <div style={{ position: 'relative', marginBottom: 16, borderRadius: 10, overflow: 'hidden', lineHeight: 0 }}>
            <img src={preview} alt="Preview" style={{ width: '100%', display: 'block', borderRadius: 10 }} />
            {bboxes.length > 0 && <BboxOverlay bboxes={bboxes} />}
          </div>
        )}

        {/* Active step description */}
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
          <p style={{ fontSize: 13, color: '#15803d', fontWeight: 500 }}>
            {stepTexts[activeStep] || '…'}
          </p>
        </div>

        {/* Pipeline step list */}
        <div className="card">
          {PIPELINE_STEPS.map(step => (
            <StepRow
              key={step.n}
              step={step}
              activeStep={activeStep}
              uploadProgress={uploadProgress}
              detection={detection}
              decision={decision}
              finalData={finalResult}
            />
          ))}
        </div>
      </div>
    );
  }

  // ── Idle form ──────────────────────────────────────────────────────────────
  return (
    <div className="page-wrap" style={{ paddingTop: 28 }}>
      <h2 style={{ fontWeight: 800, marginBottom: 4 }}>Submit Collection</h2>
      <p style={{ color: 'var(--text-3)', fontSize: 14, marginBottom: 20 }}>
        Upload a photo of plastic waste. Our AI pipeline will verify and award WWT tokens.
      </p>

      {error && <div className="error-box">{error}</div>}

      <form onSubmit={handleSubmit}>

        {/* Photo */}
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="section-title">Photo</div>
          {preview ? (
            <div>
              <div style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', lineHeight: 0, marginBottom: 10 }}>
                <img src={preview} alt="Preview" style={{ width: '100%', display: 'block', borderRadius: 8, maxHeight: 260, objectFit: 'cover' }} />
              </div>
              <button type="button" className="btn btn-secondary btn-full" onClick={() => { setImage(null); setPreview(null); if (fileRef.current) fileRef.current.value = ''; }}>
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

        {/* Plastic type */}
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="section-title">Plastic Type</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {PLASTIC_TYPES.map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setPlasticType(t)}
                style={{
                  padding: '7px 16px', borderRadius: 7, border: '2px solid',
                  borderColor: plasticType === t ? 'var(--green)' : 'var(--border)',
                  background: plasticType === t ? '#f0fdf4' : '#fff',
                  color: plasticType === t ? '#15803d' : 'var(--text-2)',
                  fontWeight: plasticType === t ? 700 : 400,
                  fontSize: 14, cursor: 'pointer',
                }}>
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Location */}
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="section-title">Location</div>
          <div className="input-group" style={{ marginBottom: 10 }}>
            <input
              type="text"
              placeholder="e.g. Westlands, Nairobi"
              value={locationLabel}
              onChange={e => setLocationLabel(e.target.value)}
            />
          </div>
          <button
            type="button"
            className={`btn btn-full ${lat ? 'btn-primary' : 'btn-secondary'}`}
            onClick={handleGetLocation}
            disabled={locLoading}
            style={{ fontSize: 14 }}>
            {locLoading ? 'Getting GPS…' : lat ? `📍 GPS acquired` : '📍 Use GPS (optional)'}
          </button>
        </div>

        {/* Weight */}
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="section-title">
            Estimated Weight
            <span style={{ fontWeight: 400, color: 'var(--text-3)', fontSize: 13 }}> (kg, optional — defaults to 0.5 kg)</span>
          </div>
          <div className="input-group" style={{ marginBottom: 0 }}>
            <input
              type="number" min="0" step="0.01"
              value={weight}
              onChange={e => setWeight(e.target.value)}
              placeholder="e.g. 1.2"
            />
            <span className="input-hint">Kilograms</span>
          </div>
        </div>

        {/* Collector info */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="section-title">Collector Info</div>
          <div className="input-group">
            <label>Your name</label>
            <input type="text" placeholder="Full name" value={collectorName} onChange={e => setCollectorName(e.target.value)} />
          </div>
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label>Wallet address <span style={{ fontWeight: 400, color: 'var(--text-3)', fontSize: 12 }}>(optional)</span></label>
            <input type="text" placeholder="0x..." value={walletAddress} onChange={e => setWalletAddress(e.target.value)} />
          </div>
        </div>

        <button type="submit" className="btn btn-primary btn-full btn-lg">
          Submit for Verification
        </button>
      </form>

      {/* Submission history */}
      <div style={{ marginTop: 28 }}>
        <button className="btn btn-secondary btn-full" style={{ marginBottom: 12 }} onClick={() => setShowHistory(s => !s)}>
          {showHistory ? '▲ Hide' : '▼ View'} Submission History ({history.length})
        </button>
        {showHistory && (
          <div className="card">
            <div className="section-title" style={{ marginBottom: 14 }}>Recent Submissions</div>
            {history.map(h => <HistoryCard key={h.id} item={h} />)}
          </div>
        )}
      </div>
    </div>
  );
}
