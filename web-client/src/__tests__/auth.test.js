import { describe, it, expect, beforeEach } from 'vitest';
import { decodeToken, getUserRole } from '../services/auth';

// Helpers
function makeToken(payload) {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.fakesig`;
}

describe('decodeToken', () => {
  beforeEach(() => localStorage.clear());

  it('returns null when no token is stored', () => {
    expect(decodeToken()).toBeNull();
  });

  it('decodes a valid JWT payload', () => {
    localStorage.setItem('wastewise_token', makeToken({ user_id: 'u1', role: 'user' }));
    const decoded = decodeToken();
    expect(decoded.user_id).toBe('u1');
    expect(decoded.role).toBe('user');
  });

  it('returns null for a malformed token', () => {
    localStorage.setItem('wastewise_token', 'not.a.token');
    expect(decodeToken()).toBeNull();
  });
});

describe('getUserRole', () => {
  beforeEach(() => localStorage.clear());

  it('returns null when no token is stored', () => {
    expect(getUserRole()).toBeNull();
  });

  it('returns role from stored token', () => {
    localStorage.setItem('wastewise_token', makeToken({ user_id: 'u2', role: 'admin' }));
    expect(getUserRole()).toBe('admin');
  });

  it('returns user role for regular accounts', () => {
    localStorage.setItem('wastewise_token', makeToken({ user_id: 'u3', role: 'user' }));
    expect(getUserRole()).toBe('user');
  });
});
