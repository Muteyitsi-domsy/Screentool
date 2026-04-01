/**
 * Reliability tests — Claude API wrapper (lib/claudeApi.ts)
 * Uses fetch mocks so no real API calls are made.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateScreenshotCopy, generateScreenshotCopyOpenAI, generateCopy } from '../lib/claudeApi';

const VALID_RESPONSE = {
  content: [
    {
      text: JSON.stringify({
        eyebrow: 'Track Daily',
        headline: 'Build habits that [em]actually[/em] stick',
        subhead: 'Simple streaks that keep you on track',
        pills: ['Smart Reminders', 'Daily Streaks', 'Progress Charts'],
      }),
    },
  ],
};

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(VALID_RESPONSE),
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('generateScreenshotCopy', () => {
  it('is a function that returns a Promise', () => {
    const result = generateScreenshotCopy('key', 'App', 'desc', 'feature', 'segment');
    expect(result).toBeInstanceOf(Promise);
    return result;
  });

  it('calls fetch with the Anthropic messages endpoint', async () => {
    await generateScreenshotCopy('sk-ant-test', 'MyApp', 'desc', 'feature', 'users');
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('sends the x-api-key header with the provided key', async () => {
    await generateScreenshotCopy('sk-ant-mykey', 'App', 'desc', 'feature', 'users');
    const [, options] = vi.mocked(fetch).mock.calls[0];
    const headers = (options as RequestInit).headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('sk-ant-mykey');
  });

  it('sends the anthropic-dangerous-direct-browser-access header', async () => {
    await generateScreenshotCopy('key', 'App', 'desc', 'feature', 'users');
    const [, options] = vi.mocked(fetch).mock.calls[0];
    const headers = (options as RequestInit).headers as Record<string, string>;
    expect(headers['anthropic-dangerous-direct-browser-access']).toBe('true');
  });

  it('returns parsed eyebrow, headline, subhead, and pills', async () => {
    const result = await generateScreenshotCopy('key', 'App', 'desc', 'feature', 'users');
    expect(result.eyebrow).toBe('Track Daily');
    expect(result.headline).toBe('Build habits that [em]actually[/em] stick');
    expect(result.subhead).toBe('Simple streaks that keep you on track');
    expect(result.pills).toEqual(['Smart Reminders', 'Daily Streaks', 'Progress Charts']);
  });

  it('returns pills as a tuple of exactly 3 strings', async () => {
    const result = await generateScreenshotCopy('key', 'App', 'desc', 'feature', 'users');
    expect(result.pills).toHaveLength(3);
    result.pills.forEach(p => expect(typeof p).toBe('string'));
  });

  it('extracts JSON even when wrapped in prose', async () => {
    const rawJson = JSON.stringify({
      eyebrow: 'Track Daily',
      headline: 'Build habits',
      subhead: 'Simple streaks',
      pills: ['Smart Reminders', 'Daily Streaks', 'Progress Charts'],
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          content: [{ text: 'Here is your App Store copy:\n' + rawJson + '\nHope that helps!' }],
        }),
      })
    );
    const result = await generateScreenshotCopy('key', 'App', 'desc', 'feature', 'users');
    expect(result.eyebrow).toBe('Track Daily');
  });

  it('throws when the API returns a non-200 status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: vi.fn().mockResolvedValue({ error: { message: 'invalid api key' } }),
      })
    );
    await expect(
      generateScreenshotCopy('bad-key', 'App', 'desc', 'feature', 'users')
    ).rejects.toThrow('invalid api key');
  });

  it('throws with a status code message when error body has no message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: vi.fn().mockResolvedValue({}),
      })
    );
    await expect(
      generateScreenshotCopy('key', 'App', 'desc', 'feature', 'users')
    ).rejects.toThrow('429');
  });

  it('throws when the response contains no JSON object', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ content: [{ text: 'No JSON here at all.' }] }),
      })
    );
    await expect(
      generateScreenshotCopy('key', 'App', 'desc', 'feature', 'users')
    ).rejects.toThrow('no JSON');
  });

  it('fills in empty strings for missing pills entries', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          content: [{ text: JSON.stringify({ eyebrow: 'e', headline: 'h', subhead: 's', pills: ['only one'] }) }],
        }),
      })
    );
    const result = await generateScreenshotCopy('key', 'App', 'desc', 'feature', 'users');
    expect(result.pills[1]).toBe('');
    expect(result.pills[2]).toBe('');
  });
});

const VALID_OPENAI_RESPONSE = {
  choices: [
    {
      message: {
        content: JSON.stringify({
          eyebrow: 'Track Daily',
          headline: 'Build habits that [em]actually[/em] stick',
          subhead: 'Simple streaks that keep you on track',
          pills: ['Smart Reminders', 'Daily Streaks', 'Progress Charts'],
        }),
      },
    },
  ],
};

describe('generateScreenshotCopyOpenAI', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(VALID_OPENAI_RESPONSE),
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is a function that returns a Promise', () => {
    const result = generateScreenshotCopyOpenAI('key', 'App', 'desc', 'feature', 'segment');
    expect(result).toBeInstanceOf(Promise);
    return result;
  });

  it('calls fetch with the OpenAI chat completions endpoint', async () => {
    await generateScreenshotCopyOpenAI('sk-test', 'MyApp', 'desc', 'feature', 'users');
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('sends the Authorization Bearer header with the provided key', async () => {
    await generateScreenshotCopyOpenAI('sk-mykey', 'App', 'desc', 'feature', 'users');
    const [, options] = vi.mocked(fetch).mock.calls[0];
    const headers = (options as RequestInit).headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer sk-mykey');
  });

  it('returns parsed eyebrow, headline, subhead, and pills', async () => {
    const result = await generateScreenshotCopyOpenAI('key', 'App', 'desc', 'feature', 'users');
    expect(result.eyebrow).toBe('Track Daily');
    expect(result.headline).toBe('Build habits that [em]actually[/em] stick');
    expect(result.subhead).toBe('Simple streaks that keep you on track');
    expect(result.pills).toEqual(['Smart Reminders', 'Daily Streaks', 'Progress Charts']);
  });

  it('returns pills as a tuple of exactly 3 strings', async () => {
    const result = await generateScreenshotCopyOpenAI('key', 'App', 'desc', 'feature', 'users');
    expect(result.pills).toHaveLength(3);
    result.pills.forEach(p => expect(typeof p).toBe('string'));
  });

  it('extracts JSON even when wrapped in prose', async () => {
    const rawJson = JSON.stringify({
      eyebrow: 'Track Daily',
      headline: 'Build habits',
      subhead: 'Simple streaks',
      pills: ['Smart Reminders', 'Daily Streaks', 'Progress Charts'],
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          choices: [{ message: { content: 'Here is your copy:\n' + rawJson + '\nHope that helps!' } }],
        }),
      })
    );
    const result = await generateScreenshotCopyOpenAI('key', 'App', 'desc', 'feature', 'users');
    expect(result.eyebrow).toBe('Track Daily');
  });

  it('throws when the API returns a non-200 status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: vi.fn().mockResolvedValue({ error: { message: 'invalid api key' } }),
      })
    );
    await expect(
      generateScreenshotCopyOpenAI('bad-key', 'App', 'desc', 'feature', 'users')
    ).rejects.toThrow('invalid api key');
  });

  it('throws with a status code message when error body has no message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: vi.fn().mockResolvedValue({}),
      })
    );
    await expect(
      generateScreenshotCopyOpenAI('key', 'App', 'desc', 'feature', 'users')
    ).rejects.toThrow('429');
  });

  it('throws when the response contains no JSON object', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ choices: [{ message: { content: 'No JSON here at all.' } }] }),
      })
    );
    await expect(
      generateScreenshotCopyOpenAI('key', 'App', 'desc', 'feature', 'users')
    ).rejects.toThrow('no JSON');
  });

  it('fills in empty strings for missing pills entries', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          choices: [{ message: { content: JSON.stringify({ eyebrow: 'e', headline: 'h', subhead: 's', pills: ['only one'] }) } }],
        }),
      })
    );
    const result = await generateScreenshotCopyOpenAI('key', 'App', 'desc', 'feature', 'users');
    expect(result.pills[1]).toBe('');
    expect(result.pills[2]).toBe('');
  });
});

describe('generateCopy (provider routing)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('routes to the Anthropic endpoint when provider is claude', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(VALID_RESPONSE),
      })
    );
    await generateCopy('claude', 'sk-ant-test', 'App', 'desc', 'feature', 'users');
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('routes to the OpenAI endpoint when provider is openai', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(VALID_OPENAI_RESPONSE),
      })
    );
    await generateCopy('openai', 'sk-test', 'App', 'desc', 'feature', 'users');
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('returns valid GeneratedCopy from claude provider', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(VALID_RESPONSE),
      })
    );
    const result = await generateCopy('claude', 'key', 'App', 'desc', 'feature', 'users');
    expect(result.eyebrow).toBe('Track Daily');
    expect(result.pills).toHaveLength(3);
  });

  it('returns valid GeneratedCopy from openai provider', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(VALID_OPENAI_RESPONSE),
      })
    );
    const result = await generateCopy('openai', 'key', 'App', 'desc', 'feature', 'users');
    expect(result.eyebrow).toBe('Track Daily');
    expect(result.pills).toHaveLength(3);
  });
});
