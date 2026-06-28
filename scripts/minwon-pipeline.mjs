#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { callOpenRouter, loadDotEnv, parseJsonObject } from './lib/openrouter-client.mjs';

const root = process.cwd();
const knowledgePath = path.join(root, 'data', 'minwon-knowledge.json');
const runsDir = path.join(root, 'runs');

const AGENTS = [
  { id: 1, name: '분류 Agent', role: 'classify', status: '민원 분석 중' },
  { id: 2, name: '검색 Agent', role: 'search', status: '근거 검색 중' },
  { id: 3, name: '작성 Agent', role: 'write', status: '답변 초안 작성 중' },
  { id: 4, name: '검수 Agent', role: 'review', status: '답변 검수 중' },
];

function nowStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');

  return [
    d.getFullYear(),
    pad(d.getMonth() + 1),
    pad(d.getDate()),
    '-',
    pad(d.getHours()),
    pad(d.getMinutes()),
    pad(d.getSeconds()),
  ].join('');
}

function logStep(title) {
  console.log(`\n=== ${title} ===`);
}

function fail(message, code = 1) {
  console.error(`\n[ERROR] ${message}`);
  process.exit(code);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArgs(argv) {
  const options = {
    sample: null,
    text: '',
    noLlm: false,
    noPixel: false,
    pixelDelayMs: 700,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--sample') {
      options.sample = Number(argv[++i]);
    } else if (arg === '--text') {
      options.text = argv[++i] ?? '';
    } else if (arg === '--no-llm') {
      options.noLlm = true;
    } else if (arg === '--no-pixel') {
      options.noPixel = true;
    } else if (arg === '--pixel-delay-ms') {
      options.pixelDelayMs = Number(argv[++i]);
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  return options;
}

function printHelp() {
  console.log(`Minwon multi-agent pipeline

Usage:
  node scripts/minwon-pipeline.mjs --sample 1
  node scripts/minwon-pipeline.mjs --text "도로 파손으로 차량이 손상되었습니다. 보상과 긴급 보수를 요청합니다."
  node scripts/minwon-pipeline.mjs --sample 1 --no-llm
  node scripts/minwon-pipeline.mjs --sample 1 --no-llm --pixel-delay-ms 1500
  node scripts/minwon-pipeline.mjs --sample 1 --no-pixel

Environment:
  OPENROUTER_API_KEY
  OPENROUTER_MODEL_CLASSIFY
  OPENROUTER_MODEL_WRITE
  OPENROUTER_MODEL_REVIEW
  OPENROUTER_TEMPERATURE
  OPENROUTER_MAX_TOKENS

Pixel Agents:
  Pixel Agents standalone server must be running first:
    node dist\\cli.js --port 3100

  Event endpoint:
    POST http://127.0.0.1:3100/api/minwon/events
`);
}

function loadKnowledge() {
  if (!fs.existsSync(knowledgePath)) {
    fail(`Knowledge file not found: ${knowledgePath}`);
  }

  return JSON.parse(fs.readFileSync(knowledgePath, 'utf8'));
}

function getInputText(options, knowledge) {
  if (options.text.trim()) {
    return options.text.trim();
  }

  if (Number.isInteger(options.sample)) {
    const sample = knowledge.samples?.find((item) => item.id === options.sample);

    if (!sample) {
      fail(`Sample ${options.sample} not found.`);
    }

    return sample.text;
  }

  fail('Input is required. Use --sample 1 or --text "민원 내용".');
}

function containsAny(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

function extractKeyIssues(text) {
  const issues = [];

  if (containsAny(text, ['도로', '파손', '포트홀', '노면'])) {
    issues.push('도로 파손 여부 및 긴급 보수 필요성');
  }

  if (containsAny(text, ['차량', '손상', '보상', '배상', '수리비'])) {
    issues.push('차량 피해 발생 여부 및 손해배상 가능성');
  }

  if (containsAny(text, ['긴급', '위험', '사고', '통행 불가', '안전'])) {
    issues.push('긴급 안전조치 필요성');
  }

  if (containsAny(text, ['소음', '진동', '공사'])) {
    issues.push('소음·진동 기준 및 현장 확인 필요성');
  }

  if (containsAny(text, ['쓰레기', '폐기물', '무단투기', '악취'])) {
    issues.push('무단투기 확인 및 환경정비 필요성');
  }

  return issues.length ? issues : ['민원 사실관계 확인', '소관 부서 검토 필요'];
}

function fallbackClassify(text) {
  let type = '일반 민원';
  let urgency = '보통';
  let direction = '소관 부서 검토 및 민원 회신';

  if (containsAny(text, ['도로', '파손', '포트홀', '차량', '보상', '배상'])) {
    type = '도로 시설물 관리 및 손해배상 관련 민원';
    direction = '현장 확인, 긴급 보수 검토, 손해배상 신청 절차 안내';
  } else if (containsAny(text, ['소음', '진동', '공사'])) {
    type = '생활소음 및 공사장 관리 민원';
    direction = '현장 점검, 소음 기준 검토, 시정조치 가능성 안내';
  } else if (containsAny(text, ['쓰레기', '폐기물', '무단투기', '악취'])) {
    type = '폐기물 및 환경정비 민원';
    direction = '현장 확인, 청소 조치, 단속 또는 계도 검토';
  }

  if (containsAny(text, ['긴급', '위험', '사고', '손상', '파손', '통행 불가'])) {
    urgency = '높음';
  }

  return {
    type,
    keyIssues: extractKeyIssues(text),
    urgency,
    direction,
    confidence: 0.7,
    method: 'rule-based-fallback',
  };
}

async function classifyComplaint(text, noLlm) {
  if (noLlm) {
    return fallbackClassify(text);
  }

  const model = process.env.OPENROUTER_MODEL_CLASSIFY || 'google/gemini-2.5-flash-lite';

  const system = `너는 공공기관 민원 분류 담당자다.
반드시 JSON 객체만 출력한다.
과도한 법률 판단을 하지 말고, 민원 유형, 핵심 쟁점, 긴급도, 처리 방향을 실무적으로 분류한다.`;

  const prompt = `아래 민원을 분류하라.

민원:
${text}

출력 JSON 형식:
{
  "type": "민원 유형",
  "keyIssues": ["핵심 쟁점 1", "핵심 쟁점 2"],
  "urgency": "낮음|보통|높음",
  "direction": "처리 방향",
  "confidence": 0.0
}`;

  try {
    const result = await callOpenRouter({
      model,
      system,
      prompt,
      temperature: 0.1,
      maxTokens: 800,
    });

    return {
      ...parseJsonObject(result.text),
      method: 'openrouter',
      model: result.model,
      usage: result.usage,
    };
  } catch (err) {
    console.warn(`[WARN] 분류 Agent OpenRouter 호출 실패. fallback 사용: ${err.message}`);
    return fallbackClassify(text);
  }
}

function searchKnowledge(text, classification, knowledge) {
  const query = [
    text,
    classification.type,
    ...(classification.keyIssues ?? []),
    classification.direction,
  ].join(' ');

  const scoreItem = (item) => {
    let score = 0;

    for (const keyword of item.keywords ?? []) {
      if (query.includes(keyword)) {
        score += 1;
      }
    }

    return score;
  };

  const laws = (knowledge.laws ?? [])
    .map((item) => ({ ...item, score: scoreItem(item) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const cases = (knowledge.cases ?? [])
    .map((item) => ({ ...item, score: scoreItem(item) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  return {
    laws,
    cases,
    method: 'local-json-keyword-search',
  };
}

function fallbackDraft(_text, classification, evidence) {
  const lawText = evidence.laws.map((item) => `- ${item.title}: ${item.summary}`).join('\n');
  const caseText = evidence.cases.map((item) => `- ${item.title}: ${item.summary}`).join('\n');

  return `안녕하십니까. 귀하께서 제기하신 민원은 "${classification.type}" 관련 사항으로 확인됩니다.

귀하의 민원 내용은 다음 쟁점과 관련이 있습니다.
- ${classification.keyIssues.join('\n- ')}

검토 가능한 관련 근거는 다음과 같습니다.
${lawText || '- 관련 법령 또는 내부 기준은 소관 부서 확인이 필요합니다.'}

유사 처리 사례는 다음과 같습니다.
${caseText || '- 유사 사례는 확인되지 않았습니다.'}

해당 민원은 현장 확인을 통해 시설물 파손 여부, 피해 발생 경위, 긴급 보수 필요성을 우선 검토할 필요가 있습니다. 차량 손상에 대한 보상 여부는 현장 조사 결과, 사고 발생 위치, 피해 자료, 관리상 하자 여부 등을 종합적으로 확인한 뒤 관련 절차에 따라 안내드릴 수 있습니다.

따라서 소관 부서에서 현장 확인 및 보수 필요성을 검토하고, 손해배상 신청 절차와 제출 자료를 별도로 안내드리겠습니다.`;
}

async function draftAnswer(text, classification, evidence, noLlm) {
  if (noLlm) {
    return {
      draft: fallbackDraft(text, classification, evidence),
      method: 'template-fallback',
    };
  }

  const model = process.env.OPENROUTER_MODEL_WRITE || 'google/gemini-2.5-flash';

  const system = `너는 공공기관 민원 답변 초안 작성 담당자다.
공문체로 작성하되, 민원인이 이해할 수 있게 명확하게 쓴다.
근거가 부족한 사항은 단정하지 말고 "검토", "확인", "안내" 표현을 사용한다.`;

  const prompt = `아래 정보를 바탕으로 민원 답변 초안을 작성하라.

[민원 원문]
${text}

[분류 결과]
${JSON.stringify(classification, null, 2)}

[검색 근거]
${JSON.stringify(evidence, null, 2)}

작성 조건:
- 한국어
- 공공기관 민원 답변체
- 과도한 책임 인정 금지
- 관련 근거와 향후 조치 포함
- 800자 이내`;

  try {
    const result = await callOpenRouter({
      model,
      system,
      prompt,
      temperature: 0.2,
      maxTokens: 1400,
    });

    return {
      draft: result.text,
      method: 'openrouter',
      model: result.model,
      usage: result.usage,
    };
  } catch (err) {
    console.warn(`[WARN] 작성 Agent OpenRouter 호출 실패. fallback 사용: ${err.message}`);
    return {
      draft: fallbackDraft(text, classification, evidence),
      method: 'template-fallback',
    };
  }
}

function fallbackReview(draft) {
  return {
    passed: true,
    issues: [
      '실제 법령 적용 여부는 소관 부서 확인 필요',
      '손해배상 가능성은 단정하지 않도록 주의 필요',
    ],
    finalAnswer: draft,
    method: 'rule-based-review',
  };
}

async function reviewAnswer(text, classification, evidence, draftResult, noLlm) {
  if (noLlm) {
    return fallbackReview(draftResult.draft);
  }

  const model = process.env.OPENROUTER_MODEL_REVIEW || 'google/gemini-2.5-flash-lite';

  const system = `너는 공공기관 민원 답변 검수자다.
답변의 정확성, 공문체, 근거 누락, 과도한 단정 여부를 검토한다.
반드시 JSON 객체만 출력한다.`;

  const prompt = `아래 민원 답변 초안을 검수하라.

[민원 원문]
${text}

[분류 결과]
${JSON.stringify(classification, null, 2)}

[검색 근거]
${JSON.stringify(evidence, null, 2)}

[답변 초안]
${draftResult.draft}

출력 JSON 형식:
{
  "passed": true,
  "issues": ["검수 의견 1", "검수 의견 2"],
  "finalAnswer": "검수 후 최종 답변"
}`;

  try {
    const result = await callOpenRouter({
      model,
      system,
      prompt,
      temperature: 0.1,
      maxTokens: 1400,
    });

    return {
      ...parseJsonObject(result.text),
      method: 'openrouter',
      model: result.model,
      usage: result.usage,
    };
  } catch (err) {
    console.warn(`[WARN] 검수 Agent OpenRouter 호출 실패. fallback 사용: ${err.message}`);
    return fallbackReview(draftResult.draft);
  }
}

function readPixelServerConfig() {
  const serverJsonPath = path.join(os.homedir(), '.pixel-agents', 'server.json');

  if (!fs.existsSync(serverJsonPath)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(serverJsonPath, 'utf8');
    const parsed = JSON.parse(raw);

    if (!parsed.port || !parsed.token) {
      return null;
    }

    return {
      url: `http://127.0.0.1:${parsed.port}`,
      token: parsed.token,
      serverJsonPath,
    };
  } catch {
    return null;
  }
}

async function sendMinwonEvent(config, payload) {
  if (!config) {
    return false;
  }

  const endpoint = `${config.url}/api/minwon/events`;
  const body = Buffer.from(JSON.stringify(payload), 'utf8');

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': String(body.length),
    },
    body,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Pixel event failed: HTTP ${response.status} ${text}`);
  }

  return true;
}

async function ensurePixelAgents(pixelConfig) {
  if (!pixelConfig) {
    console.warn(
      '[WARN] Pixel Agents server.json을 찾지 못했습니다. 화면 시각화 없이 파이프라인만 실행합니다.',
    );
    console.warn('[WARN] 먼저 실행: node dist\\cli.js --port 3100');
    return;
  }

  for (const agent of AGENTS) {
    await sendMinwonEvent(pixelConfig, {
      type: 'agentCreated',
      id: agent.id,
      sessionId: `minwon-${agent.role}`,
      folderName: '민원 처리',
      agentName: agent.name,
    });
    await sleep(200);
  }
}

async function runVisualStep(pixelConfig, agent, toolId, work, delayMs) {
  if (!pixelConfig) {
    return work();
  }

  await sendMinwonEvent(pixelConfig, {
    type: 'agentSelected',
    id: agent.id,
  });

  await sleep(200);

  await sendMinwonEvent(pixelConfig, {
    type: 'agentToolStart',
    id: agent.id,
    toolId,
    toolName: agent.name,
    status: agent.status,
  });

  try {
    const result = await work();

    await sleep(delayMs);

    await sendMinwonEvent(pixelConfig, {
      type: 'agentToolDone',
      id: agent.id,
      toolId,
    });

    await sleep(200);

    await sendMinwonEvent(pixelConfig, {
      type: 'agentToolsClear',
      id: agent.id,
    });

    await sendMinwonEvent(pixelConfig, {
      type: 'agentStatus',
      id: agent.id,
      status: 'idle',
    });

    return result;
  } catch (err) {
    await sendMinwonEvent(pixelConfig, {
      type: 'agentStatus',
      id: agent.id,
      status: 'idle',
    }).catch(() => {});

    throw err;
  }
}

function saveRun(run) {
  fs.mkdirSync(runsDir, { recursive: true });

  const stamp = nowStamp();
  const jsonPath = path.join(runsDir, `minwon-run-${stamp}.json`);
  const mdPath = path.join(runsDir, `minwon-run-${stamp}.md`);

  fs.writeFileSync(jsonPath, JSON.stringify(run, null, 2), 'utf8');
  fs.writeFileSync(mdPath, renderMarkdown(run), 'utf8');

  return { jsonPath, mdPath };
}

function renderMarkdown(run) {
  const evidenceLaws = run.evidence.laws.length
    ? run.evidence.laws.map((item) => `- ${item.title}: ${item.summary}`).join('\n')
    : '- 검색된 법령 없음';

  const evidenceCases = run.evidence.cases.length
    ? run.evidence.cases.map((item) => `- ${item.title}: ${item.summary}`).join('\n')
    : '- 검색된 사례 없음';

  const reviewIssues = run.review.issues?.length
    ? run.review.issues.map((item) => `- ${item}`).join('\n')
    : '- 특이사항 없음';

  return `# 민원 처리 Multi-Agent 실행 결과

## 1. 입력 민원

${run.inputText}

## 2. 분류 Agent 결과

- 유형: ${run.classification.type}
- 긴급도: ${run.classification.urgency}
- 처리 방향: ${run.classification.direction}
- 신뢰도: ${run.classification.confidence ?? 'N/A'}
- 방식: ${run.classification.method}

### 핵심 쟁점

${(run.classification.keyIssues ?? []).map((item) => `- ${item}`).join('\n')}

## 3. 검색/근거 Agent 결과

### 관련 법령·규정

${evidenceLaws}

### 유사 사례

${evidenceCases}

## 4. 답변 작성 Agent 초안

${run.draft.draft}

## 5. 검수 Agent 결과

- 통과 여부: ${run.review.passed ? '통과' : '수정 필요'}
- 방식: ${run.review.method}

### 검수 의견

${reviewIssues}

## 6. 최종 답변

${run.review.finalAnswer}
`;
}

async function main() {
  loadDotEnv();

  const options = parseArgs(process.argv.slice(2));
  const knowledge = loadKnowledge();
  const inputText = getInputText(options, knowledge);
  const pixelConfig = options.noPixel ? null : readPixelServerConfig();

  logStep('입력 민원');
  console.log(inputText);

  if (options.noLlm) {
    console.log('\n[mode] --no-llm fallback mode');
  }

  await ensurePixelAgents(pixelConfig);

  logStep('분류 Agent');
  const classification = await runVisualStep(
    pixelConfig,
    AGENTS[0],
    `minwon-classify-${Date.now()}`,
    () => classifyComplaint(inputText, options.noLlm),
    options.pixelDelayMs,
  );
  console.log(JSON.stringify(classification, null, 2));

  logStep('검색/근거 Agent');
  const evidence = await runVisualStep(
    pixelConfig,
    AGENTS[1],
    `minwon-search-${Date.now()}`,
    async () => searchKnowledge(inputText, classification, knowledge),
    options.pixelDelayMs,
  );
  console.log(JSON.stringify(evidence, null, 2));

  logStep('답변 작성 Agent');
  const draft = await runVisualStep(
    pixelConfig,
    AGENTS[2],
    `minwon-write-${Date.now()}`,
    () => draftAnswer(inputText, classification, evidence, options.noLlm),
    options.pixelDelayMs,
  );
  console.log(draft.draft);

  logStep('검수 Agent');
  const review = await runVisualStep(
    pixelConfig,
    AGENTS[3],
    `minwon-review-${Date.now()}`,
    () => reviewAnswer(inputText, classification, evidence, draft, options.noLlm),
    options.pixelDelayMs,
  );
  console.log(JSON.stringify(review, null, 2));

  const run = {
    createdAt: new Date().toISOString(),
    mode: options.noLlm ? 'fallback' : 'openrouter',
    pixelAgents: {
      enabled: Boolean(pixelConfig),
      url: pixelConfig?.url ?? null,
    },
    inputText,
    classification,
    evidence,
    draft,
    review,
  };

  const saved = saveRun(run);

  logStep('저장 완료');
  console.log(`JSON: ${saved.jsonPath}`);
  console.log(`MD:   ${saved.mdPath}`);

  logStep('최종 답변');
  console.log(review.finalAnswer);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
