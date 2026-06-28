#!/usr/bin/env node
import { callOpenRouter, loadDotEnv } from './lib/openrouter-client.mjs';

function fail(message, code = 1) {
  console.error(message);
  process.exit(code);
}

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => {
      resolve(data);
    });
  });
}

function parseArgs(argv) {
  const options = {
    model:
      process.env.OPENROUTER_MODEL_WRITE ||
      process.env.OPENROUTER_MODEL ||
      'google/gemini-2.5-flash',
    temperature: Number(process.env.OPENROUTER_TEMPERATURE ?? 0.2),
    maxTokens: Number(process.env.OPENROUTER_MAX_TOKENS ?? 1200),
    system: 'You are a concise Korean assistant.',
    prompt: '',
    json: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--model') {
      options.model = argv[++i];
    } else if (arg === '--temperature') {
      options.temperature = Number(argv[++i]);
    } else if (arg === '--max-tokens') {
      options.maxTokens = Number(argv[++i]);
    } else if (arg === '--system') {
      options.system = argv[++i];
    } else if (arg === '--json') {
      options.json = true;
    } else {
      options.prompt = [options.prompt, arg].filter(Boolean).join(' ');
    }
  }

  return options;
}

loadDotEnv();

const options = parseArgs(process.argv.slice(2));

if (!options.prompt.trim()) {
  const stdin = (await readStdin()).replace(/^\uFEFF/, '').trim();

  if (stdin) {
    options.prompt = stdin;
  }
}

if (!options.prompt.trim()) {
  fail(`Prompt is required.

Examples:
  node scripts/openrouter-client.mjs "안녕. 한 문장으로 답해줘."

Or:
  "안녕" | node scripts/openrouter-client.mjs`);
}

try {
  const result = await callOpenRouter({
    model: options.model,
    system: options.system,
    prompt: options.prompt,
    temperature: options.temperature,
    maxTokens: options.maxTokens,
  });

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(result.text);
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
