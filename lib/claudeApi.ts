
export interface GeneratedCopy {
  eyebrow: string;
  headline: string;  // may contain [em]...[/em] for italic gold accent
  subhead: string;
  pills: [string, string, string];
}

/**
 * Calls the Claude API (haiku) from the browser to generate App Store
 * screenshot marketing copy for one screen.
 *
 * Requires the user's own API key — it is never sent to ScreenFrame servers.
 * The `anthropic-dangerous-direct-browser-access` header is required for
 * browser-side API calls per Anthropic's docs.
 */
export const generateScreenshotCopy = async (
  apiKey: string,
  appName: string,
  description: string,
  featureDescription: string,
  segment: string
): Promise<GeneratedCopy> => {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: `You are an expert App Store copywriter. Generate screenshot marketing copy for one screen of an app.

App name: ${appName}
App description: ${description}
This screenshot shows: ${featureDescription}
Target user: ${segment}

Return ONLY a JSON object — no prose, no markdown code fences — with exactly these fields:
{
  "eyebrow": "2-4 words, label style, benefit-focused",
  "headline": "strict max 7 words, prefer 5-6, outcome-focused, wrap exactly 1-3 key words in [em]...[/em] for gold italic accent",
  "subhead": "max 48 chars, one concrete benefit sentence",
  "pills": ["2-3 word phrase", "2-3 word phrase", "2-3 word phrase"]
}

Rules:
- eyebrow: no punctuation, all-caps-ready category label
- headline: HARD LIMIT 7 words total (count carefully), emotional present-tense benefit, [em] the most powerful 1-3 words only
- subhead: specific, no fluff, ends without a period, stays under 48 chars
- pills: noun phrases, parallel structure, 2-4 words each`,
        },
      ],
    }),
  });

  if (!resp.ok) {
    const body = await resp.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(body?.error?.message ?? `Claude API error ${resp.status}`);
  }

  const data = await resp.json() as { content?: Array<{ text?: string }> };
  const text = data.content?.[0]?.text ?? '';
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Claude returned no JSON object');

  const parsed = JSON.parse(match[0]) as {
    eyebrow?: string;
    headline?: string;
    subhead?: string;
    pills?: string[];
  };

  return {
    eyebrow: String(parsed.eyebrow ?? ''),
    headline: String(parsed.headline ?? ''),
    subhead: String(parsed.subhead ?? ''),
    pills: [
      String(parsed.pills?.[0] ?? ''),
      String(parsed.pills?.[1] ?? ''),
      String(parsed.pills?.[2] ?? ''),
    ],
  };
};

/**
 * Calls the OpenAI API (gpt-4o-mini) from the browser to generate App Store
 * screenshot marketing copy for one screen.
 *
 * Uses the same prompt as generateScreenshotCopy — requires the user's own
 * OpenAI API key; it is never sent to ScreenFrame servers.
 */
export const generateScreenshotCopyOpenAI = async (
  apiKey: string,
  appName: string,
  description: string,
  featureDescription: string,
  segment: string
): Promise<GeneratedCopy> => {
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: `You are an expert App Store copywriter. Generate screenshot marketing copy for one screen of an app.

App name: ${appName}
App description: ${description}
This screenshot shows: ${featureDescription}
Target user: ${segment}

Return ONLY a JSON object — no prose, no markdown code fences — with exactly these fields:
{
  "eyebrow": "2-4 words, label style, benefit-focused",
  "headline": "strict max 7 words, prefer 5-6, outcome-focused, wrap exactly 1-3 key words in [em]...[/em] for gold italic accent",
  "subhead": "max 48 chars, one concrete benefit sentence",
  "pills": ["2-3 word phrase", "2-3 word phrase", "2-3 word phrase"]
}

Rules:
- eyebrow: no punctuation, all-caps-ready category label
- headline: HARD LIMIT 7 words total (count carefully), emotional present-tense benefit, [em] the most powerful 1-3 words only
- subhead: specific, no fluff, ends without a period, stays under 48 chars
- pills: noun phrases, parallel structure, 2-4 words each`,
        },
      ],
    }),
  });

  if (!resp.ok) {
    const body = await resp.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(body?.error?.message ?? `OpenAI API error ${resp.status}`);
  }

  const data = await resp.json() as { choices?: Array<{ message?: { content?: string } }> };
  const text = data.choices?.[0]?.message?.content ?? '';
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('OpenAI returned no JSON object');

  const parsed = JSON.parse(match[0]) as {
    eyebrow?: string;
    headline?: string;
    subhead?: string;
    pills?: string[];
  };

  return {
    eyebrow: String(parsed.eyebrow ?? ''),
    headline: String(parsed.headline ?? ''),
    subhead: String(parsed.subhead ?? ''),
    pills: [
      String(parsed.pills?.[0] ?? ''),
      String(parsed.pills?.[1] ?? ''),
      String(parsed.pills?.[2] ?? ''),
    ],
  };
};

export type AiProvider = 'claude' | 'openai';

export const generateCopy = (
  provider: AiProvider,
  apiKey: string,
  appName: string,
  description: string,
  featureDescription: string,
  segment: string
): Promise<GeneratedCopy> =>
  provider === 'openai'
    ? generateScreenshotCopyOpenAI(apiKey, appName, description, featureDescription, segment)
    : generateScreenshotCopy(apiKey, appName, description, featureDescription, segment);
