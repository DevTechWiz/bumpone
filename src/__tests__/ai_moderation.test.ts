import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { moderateProjectContent } from '../lib/aiModeration';

describe('AI Moderation Engine (Gemini + OpenRouter + Fallback)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('falls back to pending when no API keys are configured', async () => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENROUTER_API_KEY;

    const result = await moderateProjectContent({
      title: 'DevTool Startup',
      handle: 'devtool',
      destinationUrl: 'https://devtool.io',
    });

    expect(result.verdict).toBe('pending');
    expect(result.confidence).toBe(0);
    expect(result.provider).toBe('fallback');
  });

  it('approves legitimate project via Google Gemini when GEMINI_API_KEY is present', async () => {
    process.env.GEMINI_API_KEY = 'test_gemini_key';

    const mockResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  verdict: 'approved',
                  confidence: 0.98,
                  reason: 'Legitimate SaaS software project',
                  categories: {
                    nsfw: false,
                    scamOrPhishing: false,
                    hateSpeech: false,
                    malware: false,
                    impersonation: false,
                  },
                }),
              },
            ],
          },
        },
      ],
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as any);

    const result = await moderateProjectContent({
      title: 'CupidWave',
      handle: 'cupidwave',
      destinationUrl: 'https://cupidwave.in',
    });

    expect(result.verdict).toBe('approved');
    expect(result.confidence).toBe(0.98);
    expect(result.provider).toBe('gemini');
    expect(result.reason).toContain('Legitimate SaaS software project');
  });

  it('rejects blatant malicious/nsfw project via Gemini', async () => {
    process.env.GEMINI_API_KEY = 'test_gemini_key';

    const mockResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  verdict: 'rejected',
                  confidence: 0.99,
                  reason: 'Phishing domain impersonating a bank',
                  categories: {
                    nsfw: false,
                    scamOrPhishing: true,
                    hateSpeech: false,
                    malware: true,
                    impersonation: true,
                  },
                }),
              },
            ],
          },
        },
      ],
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as any);

    const result = await moderateProjectContent({
      title: 'Free Crypto Giveaway',
      handle: 'scamtoken',
      destinationUrl: 'https://fake-login-bank.com',
    });

    expect(result.verdict).toBe('rejected');
    expect(result.confidence).toBe(0.99);
    expect(result.categories.scamOrPhishing).toBe(true);
    expect(result.provider).toBe('gemini');
  });

  it('rejects vulgar/nudity image through multimodal vision', async () => {
    process.env.GEMINI_API_KEY = 'test_gemini_key';

    const mockResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  verdict: 'rejected',
                  confidence: 0.99,
                  reason: 'Explicit nudity and vulgar imagery detected in image pixels',
                  categories: {
                    nsfw: true,
                    scamOrPhishing: false,
                    hateSpeech: false,
                    malware: false,
                    impersonation: false,
                  },
                }),
              },
            ],
          },
        },
      ],
    };

    let sentBody: any = null;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any, opts: any) => {
      if (typeof url === 'string' && url.includes('generateContent')) {
        sentBody = JSON.parse(opts.body);
        return {
          ok: true,
          json: async () => mockResponse,
        } as any;
      }
      return { ok: false } as any;
    });

    const result = await moderateProjectContent({
      title: 'Innocent Sounding App',
      handle: 'innocent',
      destinationUrl: 'https://example.com',
      imageUrl: 'data:image/webp;base64,UklGRkAAAABXRUJQVlA4IDQAAADwAQCdASoBAAEAAQAcJaACdLoAAP7/1/4==',
    });

    expect(result.verdict).toBe('rejected');
    expect(result.categories.nsfw).toBe(true);
    expect(result.reason).toContain('Explicit nudity');

    // Verify inlineData vision payload was constructed and sent to Gemini
    const parts = sentBody?.contents?.[0]?.parts;
    const imagePart = parts.find((p: any) => p.inlineData);
    expect(imagePart).toBeDefined();
    expect(imagePart.inlineData.mimeType).toBe('image/webp');
  });

  it('falls back to OpenRouter when Gemini fails', async () => {
    process.env.GEMINI_API_KEY = 'test_gemini_key';
    process.env.OPENROUTER_API_KEY = 'test_openrouter_key';

    // 1. Gemini fails with 500
    // 2. OpenRouter succeeds
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  verdict: 'approved',
                  confidence: 0.92,
                  reason: 'Approved via OpenRouter fallback',
                  categories: { nsfw: false, scamOrPhishing: false, hateSpeech: false, malware: false, impersonation: false },
                }),
              },
            },
          ],
        }),
      } as any);

    const result = await moderateProjectContent({
      title: 'Analytics Cloud',
      handle: 'analytics',
      destinationUrl: 'https://analyticscloud.dev',
    });

    expect(result.verdict).toBe('approved');
    expect(result.provider).toBe('openrouter');
  });
});
