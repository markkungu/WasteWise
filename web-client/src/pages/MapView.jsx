import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Polyline, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getRoutes, clearToken } from '../services/api';

// Fix default leaflet marker icons broken by bundlers
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Nairobi neighbourhood coordinates for named stops
const NAIROBI_COORDS = {
  'Westlands':  [-1.2676, 36.8116],
  'Kibera':     [-1.3133, 36.7897],
  'Mathare':    [-1.2574, 36.8561],
  'Eastleigh':  [-1.2747, 36.8476],
  'Embakasi':   [-1.3204, 36.8944],
  'Ruaraka':    [-1.2412, 36.8677],
  'Kasarani':   [-1.2215, 36.8951],
  'Dagoretti':  [-1.2877, 36.7434],
  'Langata':    [-1.3367, 36.7597],
  'Karen':      [-1.3186, 36.7118],
};

const ROUTE_COLORS = ['#16a34a','#2563eb','#dc2626','#d97706','#7c3aed','#0891b2','#be185d','#65a30d'];

function stopToLatLng(stop) {
  if (Array.isArray(stop) && stop.length === 2) return stop;
  if (typeof stop === 'string' && NAIROBI_COORDS[stop]) return NAIROBI_COORDS[stop];
  if (stop && typeof stop === 'object') {
    if (stop.lat != null && stop.lng != null) return [stop.lat, stop.lng];
    if (stop.latitude != null) return [stop.latitude, stop.longitude];
  }
  return null;
}

export default function MapView() {
  const navigate = useNavigate();
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const data = await getRoutes();
      setRoutes(data.routes || []);
    } catch (err) {
      if (err.response?.status === 401) { clearToken(); navigate('/login'); return; }
      setError('Failed to load routes.');
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => { load(); }, [load]);

  const center = [-1.2921, 36.8219];

  return (
    <div className="page-wrap-wide" style={{ paddingTop: 28 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontWeight: 800 }}>Collection Routes</h2>
        <button className="btn btn-secondary btn-sm" onClick={load}>↺ Refresh</button>
      </div>

      {error && <div className="error-box">{error}</div>}

      {loading ? (
        <div className="spinner" />
      ) : (
        <>
          {routes.length === 0 && (
            <div className="error-box">No optimized routes available yet. An admin can generate them from the optimization service.</div>
          )}

          <div style={{ borderRadius: 12, overflow: 'hidden', boxShadow: 'var(--shadow)', marginBottom: 16 }}>
            <MapContainer center={center} zoom={11} style={{ height: 480, width: '100%' }}>
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {routes.map((route, i) => {
                const color = ROUTE_COLORS[i % ROUTE_COLORS.length];
                const coords = (route.route_order || []).map(stopToLatLng).filter(Boolean);
                return (
                  <React.Fragment key={route.id || i}>
                    {coords.length > 1 && <Polyline positions={coords} pathOptions={{ color, weight: 4, opacity: 0.8 }} />}
                    {coords.map((pos, j) => {
                      const stop = route.route_order[j];
                      const label = typeof stop === 'string' ? stop : `Stop ${j + 1}`;
                      const desc = j === 0 ? 'Start' : j === coords.length - 1 ? 'End' : route.zone || '';
                      return (
                        <Marker key={j} position={pos} icon={L.divIcon({
                          className: '',
                          html: `<div style="background:${color};color:#fff;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.3)">${j + 1}</div>`,
                          iconSize: [22, 22],
                          iconAnchor: [11, 11],
                        })}>
                          <Popup><strong>{label}</strong><br />{desc}</Popup>
                        </Marker>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </MapContainer>
          </div>

          {routes.length > 0 && (
            <div className="card">
              <div className="section-title">Route Legend</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {routes.map((route, i) => (
                  <div key={route.id || i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 16, height: 16, borderRadius: '50%', background: ROUTE_COLORS[i % ROUTE_COLORS.length], flexShrink: 0 }} />
                    <span style={{ fontWeight: 600, flex: 1 }}>{route.zone || `Route ${i + 1}`}</span>
                    <span style={{ fontSize: 13, color: 'var(--text-3)' }}>{route.total_distance_km} km</span>
                    <span style={{ fontSize: 13, color: 'var(--text-3)' }}>{route.algorithm_used}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
