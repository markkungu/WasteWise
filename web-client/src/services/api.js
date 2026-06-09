import axios from 'axios';

// In Docker: nginx proxies /api → backend:5000/api (set via VITE_API_URL=/api at build time)
// In local dev: falls back to direct backend URL
const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const TOKEN_KEY = 'wastewise_token';

const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) localStorage.removeItem(TOKEN_KEY);
    return Promise.reject(err);
  }
);

export const storeToken = (token) => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);
export const getToken = () => localStorage.getItem(TOKEN_KEY);

export const login = async (email, password) => {
  const { data } = await api.post('/auth/login', { email, password });
  return data;
};

export const register = async (name, email, password, walletAddress) => {
  const payload = { name, email, password };
  if (walletAddress) payload.wallet_address = walletAddress;
  const { data } = await api.post('/auth/register', payload);
  return data;
};

export const getProfile = async () => {
  const { data } = await api.get('/auth/profile');
  return data;
};

export const submitWaste = async (imageFile, latitude, longitude, reportedWeightKg) => {
  const formData = new FormData();
  formData.append('image', imageFile);
  formData.append('latitude', String(latitude));
  formData.append('longitude', String(longitude));
  if (reportedWeightKg != null) formData.append('reported_weight_kg', String(reportedWeightKg));
  const { data } = await api.post('/submissions', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000,
  });
  return data;
};

export const getSubmissions = async (page = 1, limit = 20) => {
  const { data } = await api.get('/submissions', { params: { page, limit } });
  return data;
};

export const getRewards = async (page = 1, limit = 20) => {
  const { data } = await api.get('/rewards', { params: { page, limit } });
  return data;
};

export const getRoutes = async () => {
  const { data } = await api.get('/routes/latest');
  return data;
};

export const optimizeRoutes = async (algorithm = 'pso', zones = []) => {
  const { data } = await api.post('/routes/optimize', { algorithm, zones }, { timeout: 180000 });
  return data;
};

export const getDashboardStats = async () => {
  const { data } = await api.get('/analytics/dashboard');
  return data;
};

export const getComparison = async () => {
  const { data } = await api.get('/routes/comparison');
  return data;
};

export const compareCustom = async (locations) => {
  const { data } = await api.post('/routes/compare/custom', { locations }, { timeout: 300000 });
  return data;
};

export default api;
