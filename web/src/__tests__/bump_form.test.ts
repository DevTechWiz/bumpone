import { describe, it, expect } from 'vitest';
import { normalizeUrl } from '../lib/urls';

describe('Bump Form & URL Normalization', () => {
  it('normalizes bare domains to https', () => {
    expect(normalizeUrl('bumpone.lol')).toBe('https://bumpone.lol');
    expect(normalizeUrl('sub.domain.co/page')).toBe('https://sub.domain.co/page');
    expect(normalizeUrl('my-product.com/app?ref=123')).toBe('https://my-product.com/app?ref=123');
  });

  it('upgrades http to https', () => {
    expect(normalizeUrl('http://insecure.com')).toBe('https://insecure.com');
    expect(normalizeUrl('http://example.com/test')).toBe('https://example.com/test');
  });

  it('preserves existing https URLs', () => {
    expect(normalizeUrl('https://valid.com')).toBe('https://valid.com');
    expect(normalizeUrl('https://x.com/bumpone_lol')).toBe('https://x.com/bumpone_lol');
  });

  it('trims leading and trailing whitespace', () => {
    expect(normalizeUrl('   myproject.com   ')).toBe('https://myproject.com');
    expect(normalizeUrl('   https://myproject.com   ')).toBe('https://myproject.com');
  });

  it('returns empty string for empty or whitespace-only input', () => {
    expect(normalizeUrl('')).toBe('');
    expect(normalizeUrl('   ')).toBe('');
  });

  it('generates valid URL object after normalization', () => {
    const normalized = normalizeUrl('myapp.ai/dashboard');
    const parsed = new URL(normalized);
    expect(parsed.protocol).toBe('https:');
    expect(parsed.hostname).toBe('myapp.ai');
    expect(parsed.pathname).toBe('/dashboard');
  });
});
