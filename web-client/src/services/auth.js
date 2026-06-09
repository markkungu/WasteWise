import { getToken } from './api';

export function decodeToken() {
  const token = getToken();
  if (!token) return null;
  try {
    const payload = token.split('.')[1];
    return JSON.parse(atob(payload));
  } catch {
    return null;
  }
}

export function getUserRole() {
  return decodeToken()?.role || null;
}
