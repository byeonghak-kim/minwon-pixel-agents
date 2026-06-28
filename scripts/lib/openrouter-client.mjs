import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

export function loadDotEnv() {
  const envPath = path.join(root, '.env');

  if (!fs.existsSync(envPath)) {
    return;
  }

  const raw = fs.readFileSync(envPath, 'utf8').replace(/^\uFEFF/, '');

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const eqIndex = trimmed.indexOf('=');

    if (eqIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function extractText(payload) {
  const content = payload?.choices?.[0]?.message?.content;

  if (typeof content === 'string') {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (typeof part?.text === 'string') return part.text;
        return '';
      })
      .join('')
      .trim();
  }

  return '';
}

export async function callOpenRouter({
  model,
  system,
  prompt,
  temperature = Number(process.env.OPENROUTER_TEMPERATURE ?? 0.2),
  maxTokens = Number(process.env.OPENROUTER_MAX_TOKENS ?? 1200),
  responseFormat = null,
}) {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is missing. Create .env or set the environment variable.');
  }

  if (!model) {
    throw new Error('OpenRouter model is missing.');
  }

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };

  const referer = process.env.OPENROUTER_HTTP_REFERER;
  const title = process.env.OPENROUTER_APP_TITLE || 'Minwon Pixel Agents';

  if (referer) {
    headers['HTTP-Referer'] = referer;
  }

  if (title) {
    headers['X-OpenRouter-Title'] = title;
  }

  const body = {
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: prompt },
    ],
    temperature,
    max_tokens: maxTokens,
  };

  if (responseFormat) {
    body.response_format = responseFormat;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);

  let response;

  try {
    response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('OpenRouter request timed out.');
    }

    throw new Error(
      `OpenRouter request failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    clearTimeout(timeout);
  }

  const rawText = await response.text();

  let payload;

  try {
    payload = JSON.parse(rawText);
  } catch {
    throw new Error(`OpenRouter returned non-JSON response. HTTP ${response.status}\n${rawText}`);
  }

  if (!response.ok) {
    throw new Error(
      `OpenRouter API error. HTTP ${response.status}\n${JSON.stringify(payload, null, 2)}`,
    );
  }

  const text = extractText(payload);

  if (!text) {
    throw new Error(
      `OpenRouter response did not contain message content.\n${JSON.stringify(payload, null, 2)}`,
    );
  }

  return {
    text,
    usage: payload.usage ?? null,
    id: payload.id ?? null,
    model,
  };
}

export function parseJsonObject(text) {
  const trimmed = text.trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);

    if (!match) {
      throw new Error(`Model output is not JSON:\n${text}`);
    }

    return JSON.parse(match[0]);
  }
}
