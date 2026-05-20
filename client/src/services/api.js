import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";

// ---------------------------------------------------------------------------
// Base URL — override with EXPO_PUBLIC_API_URL env variable at build time
// ---------------------------------------------------------------------------
const BASE_URL =
  process.env.EXPO_PUBLIC_API_URL || "http://localhost:5000/api";

const TOKEN_KEY = "@wastewise_token";

// ---------------------------------------------------------------------------
// Axios instance
// ---------------------------------------------------------------------------
const api = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 30_000,
});

// ---------------------------------------------------------------------------
// Request interceptor — attach stored JWT
// ---------------------------------------------------------------------------
api.interceptors.request.use(
  async (config) => {
    try {
      const token = await AsyncStorage.getItem(TOKEN_KEY);
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (_) {
      // If AsyncStorage read fails, proceed without token
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ---------------------------------------------------------------------------
// Response interceptor — handle 401 (token expired / invalid)
// ---------------------------------------------------------------------------
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      try {
        await AsyncStorage.removeItem(TOKEN_KEY);
      } catch (_) {}
      // The navigation redirect is handled by individual screens or a
      // top-level auth context that watches AsyncStorage.
    }
    return Promise.reject(error);
  }
);

// ---------------------------------------------------------------------------
// Token helpers (exported so screens can persist after login)
// ---------------------------------------------------------------------------
export const storeToken = (token) => AsyncStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => AsyncStorage.removeItem(TOKEN_KEY);
export const getToken = () => AsyncStorage.getItem(TOKEN_KEY);

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

/**
 * POST /auth/login
 * @returns {{ token: string, user: object }}
 */
export const login = async (email, password) => {
  const { data } = await api.post("/auth/login", { email, password });
  return data;
};

/**
 * POST /auth/register
 * @returns {{ token: string, user: object }}
 */
export const register = async (name, email, password, walletAddress) => {
  const payload = { name, email, password };
  if (walletAddress) payload.wallet_address = walletAddress;
  const { data } = await api.post("/auth/register", payload);
  return data;
};

// ---------------------------------------------------------------------------
// Submissions
// ---------------------------------------------------------------------------

/**
 * POST /submissions  (multipart/form-data)
 *
 * @param {string} imageUri         - Local file URI from camera / image picker
 * @param {number} latitude
 * @param {number} longitude
 * @param {number|null} reportedWeightKg
 * @returns {object} Submission response from the server
 */
export const submitWaste = async (
  imageUri,
  latitude,
  longitude,
  reportedWeightKg
) => {
  const formData = new FormData();

  // React Native FormData automatically reads the file from the URI
  const filename = imageUri.split("/").pop();
  const match = /\.(\w+)$/.exec(filename);
  const type = match ? `image/${match[1]}` : "image/jpeg";

  formData.append("image", { uri: imageUri, name: filename, type });
  formData.append("latitude", String(latitude));
  formData.append("longitude", String(longitude));
  if (reportedWeightKg != null) {
    formData.append("reported_weight_kg", String(reportedWeightKg));
  }

  const { data } = await api.post("/submissions", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 60_000, // ML verification can take up to 30 s
  });
  return data;
};

/**
 * GET /submissions
 * @param {number} page
 * @param {number} limit
 * @returns {{ submissions: object[], pagination: object }}
 */
export const getSubmissions = async (page = 1, limit = 20) => {
  const { data } = await api.get("/submissions", { params: { page, limit } });
  return data;
};

// ---------------------------------------------------------------------------
// Rewards
// ---------------------------------------------------------------------------

/**
 * GET /rewards
 * @returns {{ rewards: object[], totals: object, pagination: object }}
 */
export const getRewards = async (page = 1, limit = 20) => {
  const { data } = await api.get("/rewards", { params: { page, limit } });
  return data;
};

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * GET /routes/latest
 * @returns {{ routes: object[], count: number }}
 */
export const getRoutes = async () => {
  const { data } = await api.get("/routes/latest");
  return data;
};

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

/**
 * GET /analytics/dashboard  (admin / company roles only)
 * @returns {{ submissions: object, rewards: object, top_neighborhoods: object[], recent_activity: object[] }}
 */
export const getDashboardStats = async () => {
  const { data } = await api.get("/analytics/dashboard");
  return data;
};

export default api;
