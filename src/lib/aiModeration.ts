/**
 * AI-Powered Project Content Moderation Engine with Multimodal Vision
 * 
 * Inspects both text (title, handle, URL) AND image pixels (nudity, vulgarity, NSFW):
 * 1. Primary: Google Gemini 2.5 Flash (Multimodal Vision API via GEMINI_API_KEY)
 * 2. Fallback: OpenRouter Vision (via OPENROUTER_API_KEY)
 * 3. Fail-Closed Fallback: If neither key is configured or both APIs fail,
 *    returns 'pending' so suspicious submissions never slip past unnoticed.
 */

export interface ModerationTarget {
  title: string;
  handle: string;
  destinationUrl: string;
  imageUrl?: string | null;
  description?: string | null;
}

export interface ModerationResult {
  verdict: 'approved' | 'rejected' | 'pending';
  confidence: number;
  reason: string;
  categories: {
    nsfw: boolean;
    scamOrPhishing: boolean;
    hateSpeech: boolean;
    malware: boolean;
    impersonation: boolean;
  };
  provider: 'gemini' | 'openrouter' | 'fallback';
}

const SAFETY_PROMPT = `You are a strict, objective AI content safety and visual legitimacy auditor for BumpOne, a digital billboard directory for genuine websites, software products, indie startups, creator tools, blogs, and SaaS platforms.

Your duty is to evaluate whether a project submission is safe, authentic, and compliant with web safety rules.

CRITICAL VISUAL PIXEL INSPECTION:
- When an image/logo is provided, you MUST inspect the image pixels directly.
- REJECT immediately if the image contains:
  * Any nudity, exposed bodies, sexually explicit or suggestive poses, or pornography.
  * Vulgarity, obscene gestures, sexually provocative artwork, or gore.
  * Adult dating, escort, or NSFW graphic representations.
- Any vulgar or nude imagery MUST be REJECTED with categories.nsfw = true and verdict = "rejected".

STRICT VIOLATION CATEGORIES (Must REJECT immediately):
1. adult/NSFW, nudity, vulgarity, sexually explicit services or pornography.
2. scam, phishing, deceptive investment schemes, pump-and-dump tokens, or fraud.
3. malware, spyware, suspicious downloads, or credential harvesting.
4. hate speech, harassment, violence, extremism, or illegal weapons/drugs.
5. malicious impersonation of recognized financial institutions or brands.

APPROVAL CRITERIA (Must APPROVE):
- Authentic startups, SaaS tools, open-source repos, developer utilities, games, ecommerce brands, portfolios, blogs, creative projects, or community sites.
- Normal marketing language and clean logos/graphics are acceptable.

UNSURE / FLAGGED CRITERIA (Return PENDING):
- URL looks unresolvable, dead, or ambiguous.
- Image is ambiguous or confidence is below 85%.

Return strict valid JSON ONLY in this exact structure:
{
  "verdict": "approved" | "rejected" | "pending",
  "confidence": 0.95,
  "reason": "Brief 1-sentence reason for verdict",
  "categories": {
    "nsfw": false,
    "scamOrPhishing": false,
    "hateSpeech": false,
    "malware": false,
    "impersonation": false
  }
}`;

/**
 * Fetch and extract raw base64 image data for multimodal vision
 */
async function resolveImageInlineData(imageUrl?: string | null): Promise<{ mimeType: string; data: string } | null> {
  if (!imageUrl) return null;

  // 1. Data URI: data:image/webp;base64,AAAA...
  if (imageUrl.startsWith('data:')) {
    const match = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      return {
        mimeType: match[1] || 'image/webp',
        data: match[2],
      };
    }
    return null;
  }

  // 2. Remote URL: https://...
  if (imageUrl.startsWith('https://') || imageUrl.startsWith('http://')) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2500);
      const res = await fetch(imageUrl, {
        signal: controller.signal,
        headers: { Accept: 'image/webp,image/png,image/jpeg,image/*;q=0.8' },
      });
      clearTimeout(timeout);
      if (!res.ok) return null;

      const rawType = res.headers.get('content-type') || 'image/webp';
      const mimeType = rawType.split(';')[0].trim();

      const arrayBuffer = await res.arrayBuffer();
      // Cap at 2.5 MB to avoid memory pressure
      if (arrayBuffer.byteLength > 2.5 * 1024 * 1024) return null;

      const base64 = Buffer.from(arrayBuffer).toString('base64');
      return { mimeType, data: base64 };
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Primary: Evaluate with Google Gemini Multimodal Vision API
 */
async function evaluateWithGemini(target: ModerationTarget): Promise<ModerationResult | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const inlineImage = await resolveImageInlineData(target.imageUrl);

    const userContent = `Project to evaluate:
- Title: ${target.title}
- Handle: @${target.handle}
- Website URL: ${target.destinationUrl}
- Description: ${target.description || 'None'}
${inlineImage ? '- Attached Image: Please inspect the attached logo/graphic pixels for nudity, vulgarity, and appropriateness.' : '- Attached Image: None provided.'}`;

    const parts: any[] = [
      { text: SAFETY_PROMPT },
      { text: userContent },
    ];

    if (inlineImage) {
      parts.push({
        inlineData: {
          mimeType: inlineImage.mimeType,
          data: inlineImage.data,
        },
      });
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts,
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1,
          maxOutputTokens: 300,
        },
      }),
    });

    clearTimeout(timeoutId);
    if (!res.ok) {
      console.warn(`[AI Moderation] Gemini API returned ${res.status}`);
      return null;
    }

    const json = await res.json();
    const candidateText = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidateText) return null;

    const parsed = JSON.parse(candidateText);
    const verdict = parsed.verdict === 'approved' || parsed.verdict === 'rejected' ? parsed.verdict : 'pending';

    return {
      verdict,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.9,
      reason: parsed.reason || 'Evaluated by Google Gemini Vision',
      categories: {
        nsfw: Boolean(parsed.categories?.nsfw),
        scamOrPhishing: Boolean(parsed.categories?.scamOrPhishing),
        hateSpeech: Boolean(parsed.categories?.hateSpeech),
        malware: Boolean(parsed.categories?.malware),
        impersonation: Boolean(parsed.categories?.impersonation),
      },
      provider: 'gemini',
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    console.warn('[AI Moderation] Gemini evaluation error:', err?.message || err);
    return null;
  }
}

/**
 * Fallback: Evaluate with OpenRouter Vision API
 */
async function evaluateWithOpenRouter(target: ModerationTarget): Promise<ModerationResult | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const inlineImage = await resolveImageInlineData(target.imageUrl);

    const userContent = `Project to evaluate:
- Title: ${target.title}
- Handle: @${target.handle}
- Website URL: ${target.destinationUrl}
- Description: ${target.description || 'None'}`;

    const userMessageContent: any[] = [
      { type: 'text', text: userContent },
    ];

    if (inlineImage) {
      userMessageContent.push({
        type: 'image_url',
        image_url: {
          url: `data:${inlineImage.mimeType};base64,${inlineImage.data}`,
        },
      });
    }

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://bumpone.lol',
        'X-Title': 'BumpOne Moderation',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        response_format: { type: 'json_object' },
        temperature: 0.1,
        max_tokens: 300,
        messages: [
          { role: 'system', content: SAFETY_PROMPT },
          { role: 'user', content: userMessageContent },
        ],
      }),
    });

    clearTimeout(timeoutId);
    if (!res.ok) {
      console.warn(`[AI Moderation] OpenRouter returned ${res.status}`);
      return null;
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content);
    const verdict = parsed.verdict === 'approved' || parsed.verdict === 'rejected' ? parsed.verdict : 'pending';

    return {
      verdict,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.85,
      reason: parsed.reason || 'Evaluated by OpenRouter Vision',
      categories: {
        nsfw: Boolean(parsed.categories?.nsfw),
        scamOrPhishing: Boolean(parsed.categories?.scamOrPhishing),
        hateSpeech: Boolean(parsed.categories?.hateSpeech),
        malware: Boolean(parsed.categories?.malware),
        impersonation: Boolean(parsed.categories?.impersonation),
      },
      provider: 'openrouter',
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    console.warn('[AI Moderation] OpenRouter evaluation error:', err?.message || err);
    return null;
  }
}

/**
 * Orchestrator: Runs Gemini Vision -> OpenRouter Vision -> Fallback to Pending
 */
export async function moderateProjectContent(target: ModerationTarget): Promise<ModerationResult> {
  // 1. Try Google Gemini Multimodal Vision first
  const geminiResult = await evaluateWithGemini(target);
  if (geminiResult) return geminiResult;

  // 2. Try OpenRouter Vision fallback
  const openRouterResult = await evaluateWithOpenRouter(target);
  if (openRouterResult) return openRouterResult;

  // 3. Fail-Closed Fallback: Queue for manual admin review
  return {
    verdict: 'pending',
    confidence: 0,
    reason: 'AI moderation unavailable; queued for manual review',
    categories: {
      nsfw: false,
      scamOrPhishing: false,
      hateSpeech: false,
      malware: false,
      impersonation: false,
    },
    provider: 'fallback',
  };
}
