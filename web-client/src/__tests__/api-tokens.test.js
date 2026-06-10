import { describe, it, expect, beforeEach } from 'vitest';
import { storeToken, clearToken, getToken } from '../services/api';

describe('token helpers', () => {
  beforeEach(() => localStorage.clear());

  it('storeToken saves token to localStorage', () => {
    storeToken('abc123');
    expect(localStorage.getItem('wastewise_token')).toBe('abc123');
  });

  it('getToken retrieves the stored token', () => {
    localStorage.setItem('wastewise_token', 'xyz');
    expect(getToken()).toBe('xyz');
  });

  it('clearToken removes the token', () => {
    storeToken('abc');
    clearToken();
    expect(getToken()).toBeNull();
  });

  it('getToken returns null when nothing stored', () => {
    expect(getToken()).toBeNull();
  });
});
