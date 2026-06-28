# 민원 처리 Multi-Agent Pixel Agents

공공 민원 처리 과정을 여러 AI Agent가 협업하는 형태로 구성하고, 각 Agent의 진행 상태를 Pixel Agents 화면에서 시각적으로 확인할 수 있도록 만든 프로젝트입니다.

기존 Pixel Agents의 맵, 캐릭터, WebSocket 기반 UI 구조를 유지하면서, 민원 분류 → 근거 검색 → 답변 초안 작성 → 검수의 4단계 파이프라인을 연결했습니다.

정적인 결과 화면을 따로 만든 것이 아니라, 실제 Pixel Agents 서버의 AgentStateStore와 WebSocket 이벤트 흐름을 활용해 각 Agent가 순차적으로 작업하는 모습을 보여줍니다.

---

## 주요 기능

### 1. 4단계 민원 처리 Multi-Agent 파이프라인

민원 1건을 입력하면 다음 4개 Agent가 순차적으로 처리합니다.

| Agent      | 역할                                         | 화면 표시 상태    |
| ---------- | -------------------------------------------- | ----------------- |
| 분류 Agent | 민원 유형, 핵심 쟁점, 긴급도, 처리 방향 분류 | 민원 분석 중      |
| 검색 Agent | 로컬 지식베이스에서 관련 법령·사례 검색      | 근거 검색 중      |
| 작성 Agent | 민원 답변 초안 작성                          | 답변 초안 작성 중 |
| 검수 Agent | 초안의 표현, 근거, 과도한 단정 여부 검토     | 답변 검수 중      |

---

### 2. Pixel Agents 원본 UI 연동

이 프로젝트는 별도의 정적 HTML 데모 화면을 만들지 않습니다.

기존 Pixel Agents의 다음 구조를 그대로 사용합니다.

- 기존 맵 화면
- 기존 캐릭터 표시 방식
- 기존 WebSocket 연결
- 기존 Agent 상태 표시 UI
- 기존 AgentStateStore

추가된 부분은 `/api/minwon/events` 엔드포인트입니다.
민원 파이프라인 실행 중 발생하는 Agent 이벤트를 이 엔드포인트로 전달하면, 기존 Pixel Agents 화면에서 각 Agent의 상태가 순차적으로 반영됩니다.

---

### 3. OpenRouter 기반 LLM 호출 및 fallback 모드 지원

OpenRouter API Key가 있으면 실제 LLM을 호출해 민원 분류, 답변 작성, 검수를 수행합니다.

API Key가 없거나 오프라인 환경에서 테스트하고 싶을 경우 `--no-llm` 옵션으로 fallback 모드를 사용할 수 있습니다.

```bash
node scripts/minwon-pipeline.mjs --sample 1 --no-llm
```

fallback 모드에서는 사전에 정의된 규칙과 템플릿을 사용해 전체 파이프라인을 실행합니다.

---

### 4. 실행 결과 저장

파이프라인 실행 결과는 `runs/` 폴더에 저장됩니다.

- JSON: 전체 처리 결과 데이터
- Markdown: 사람이 읽기 쉬운 실행 결과 보고서

예시 파일명:

```text
runs/minwon-run-YYYYMMDD-HHMMSS.json
runs/minwon-run-YYYYMMDD-HHMMSS.md
```

실행 결과 파일은 `.gitignore`에 의해 Git 추적 대상에서 제외됩니다.

---

## 프로젝트 구조

```text
.
├─ data/
│  └─ minwon-knowledge.json
│
├─ runs/
│  └─ .gitkeep
│
├─ scripts/
│  ├─ minwon-pipeline.mjs
│  ├─ openrouter-client.mjs
│  └─ lib/
│     └─ openrouter-client.mjs
│
├─ server/
│  └─ src/
│     └─ httpServer.ts
│
├─ .env.example
└─ .gitignore
```

### 주요 파일 설명

| 파일                                | 설명                                               |
| ----------------------------------- | -------------------------------------------------- |
| `data/minwon-knowledge.json`        | 민원 처리에 사용할 로컬 법령·사례·샘플 데이터      |
| `scripts/minwon-pipeline.mjs`       | 민원 처리 Multi-Agent 파이프라인 실행 스크립트     |
| `scripts/lib/openrouter-client.mjs` | OpenRouter API 호출 공통 모듈                      |
| `scripts/openrouter-client.mjs`     | OpenRouter 단독 호출 테스트용 CLI                  |
| `server/src/httpServer.ts`          | Pixel Agents 서버에 민원 이벤트 수신 endpoint 추가 |
| `runs/.gitkeep`                     | 실행 결과 저장 폴더 유지용 파일                    |
| `.env.example`                      | 환경변수 예시 파일                                 |

---

## 설치 방법

### 1. 저장소 클론

```bash
git clone https://github.com/byeonghak-kim/minwon-pixel-agents.git
cd minwon-pixel-agents
```

### 2. 패키지 설치

```bash
npm install
```

### 3. 빌드

```bash
npm run build
```

빌드가 정상적으로 완료되면 Pixel Agents 서버와 민원 파이프라인을 실행할 수 있습니다.

---

## 환경변수 설정

OpenRouter API를 사용할 경우 `.env.example`을 참고해 `.env` 파일을 생성합니다.

```bash
cp .env.example .env
```

Windows PowerShell에서는 다음 명령을 사용할 수 있습니다.

```powershell
Copy-Item .env.example .env
```

`.env` 파일에 OpenRouter API Key를 입력합니다.

```env
OPENROUTER_API_KEY=your_openrouter_api_key_here
OPENROUTER_MODEL_CLASSIFY=google/gemini-2.5-flash-lite
OPENROUTER_MODEL_WRITE=google/gemini-2.5-flash
OPENROUTER_MODEL_REVIEW=google/gemini-2.5-flash-lite
```

`.env` 파일은 `.gitignore`에 포함되어 있으므로 GitHub에 업로드되지 않습니다.

---

## 실행 방법

### 1. Pixel Agents 서버 실행

첫 번째 터미널에서 서버를 실행합니다.

```bash
node dist/cli.js --port 3100
```

Windows PowerShell에서는 다음과 같이 실행합니다.

```powershell
node dist\cli.js --port 3100
```

정상 실행되면 다음 주소로 접속합니다.

```text
http://127.0.0.1:3100
```

브라우저에서 Pixel Agents 맵 화면이 표시되어야 합니다.

---

### 2. 민원 파이프라인 실행

두 번째 터미널을 열고 다음 명령을 실행합니다.

```bash
node scripts/minwon-pipeline.mjs --sample 1
```

Windows PowerShell에서도 동일하게 실행할 수 있습니다.

```powershell
node scripts\minwon-pipeline.mjs --sample 1
```

실행하면 다음 순서로 Agent가 동작합니다.

```text
분류 Agent → 검색 Agent → 작성 Agent → 검수 Agent
```

브라우저의 Pixel Agents 화면에서는 각 Agent가 순차적으로 작업 상태를 표시합니다.

---

## 샘플 민원 실행

### 도로 파손 및 차량 손상 민원

```bash
node scripts/minwon-pipeline.mjs --sample 1
```

샘플 입력:

```text
도로 파손으로 차량이 손상되었습니다. 보상과 긴급 보수를 요청합니다.
```

### 공사 소음 민원

```bash
node scripts/minwon-pipeline.mjs --sample 2
```

샘플 입력:

```text
아파트 앞 공사장에서 밤늦게까지 소음이 심합니다. 점검과 조치를 요청합니다.
```

### 쓰레기 무단투기 민원

```bash
node scripts/minwon-pipeline.mjs --sample 3
```

샘플 입력:

```text
골목에 쓰레기 무단투기가 반복되고 악취가 심합니다. 단속과 청소를 요청합니다.
```

---

## 직접 민원 입력 실행

`--text` 옵션을 사용하면 원하는 민원 문장을 직접 입력할 수 있습니다.

```bash
node scripts/minwon-pipeline.mjs --text "도로 파손으로 차량이 손상되었습니다. 보상과 긴급 보수를 요청합니다."
```

Windows PowerShell 예시:

```powershell
node scripts\minwon-pipeline.mjs --text "도로 파손으로 차량이 손상되었습니다. 보상과 긴급 보수를 요청합니다."
```

---

## LLM 없이 실행하기

OpenRouter API Key 없이 전체 흐름만 확인하려면 `--no-llm` 옵션을 사용합니다.

```bash
node scripts/minwon-pipeline.mjs --sample 1 --no-llm
```

이 모드는 다음을 확인할 때 유용합니다.

- Pixel Agents 화면 연동 여부
- 4개 Agent 순차 상태 표시
- 결과 파일 저장 여부
- 기본 파이프라인 동작 여부

---

## 화면 표시 속도 조절

`--pixel-delay-ms` 옵션으로 각 Agent의 작업 상태가 화면에 유지되는 시간을 조절할 수 있습니다.

```bash
node scripts/minwon-pipeline.mjs --sample 1 --pixel-delay-ms 1500
```

값이 클수록 화면에서 각 Agent의 진행 상태를 더 오래 볼 수 있습니다.

---

## 실행 결과 확인

파이프라인 실행이 끝나면 `runs/` 폴더에 결과 파일이 생성됩니다.

```text
runs/minwon-run-YYYYMMDD-HHMMSS.json
runs/minwon-run-YYYYMMDD-HHMMSS.md
```

Markdown 결과 파일에는 다음 내용이 포함됩니다.

- 입력 민원
- 분류 Agent 결과
- 검색/근거 Agent 결과
- 답변 작성 Agent 초안
- 검수 Agent 의견
- 최종 답변

---

## OpenRouter 단독 테스트

OpenRouter 연결만 별도로 확인하고 싶다면 다음 명령을 사용할 수 있습니다.

```bash
node scripts/openrouter-client.mjs "안녕. 한 문장으로 답해줘."
```

PowerShell 파이프 입력도 가능합니다.

```powershell
"안녕. 한 문장으로 답해줘." | node scripts\openrouter-client.mjs
```

---

## 주요 구현 방식

### 1. 민원 이벤트 endpoint 추가

`server/src/httpServer.ts`에 다음 endpoint를 추가했습니다.

```text
POST /api/minwon/events
```

이 endpoint는 Pixel Agents 서버의 기존 인증 토큰을 사용합니다.

민원 파이프라인은 실행 중 다음 이벤트를 전달합니다.

- `agentCreated`
- `agentSelected`
- `agentToolStart`
- `agentToolDone`
- `agentToolsClear`
- `agentStatus`

`agentCreated` 이벤트는 기존 `AgentStateStore`에 Agent를 등록합니다.
그 외 이벤트는 기존 WebSocket broadcast 경로를 통해 브라우저 화면에 전달됩니다.

---

### 2. 기존 Pixel Agents UI 유지

이 프로젝트는 원본 UI를 대체하지 않습니다.

민원 처리 기능은 기존 Pixel Agents 서버에 작은 이벤트 주입 경로를 추가하는 방식으로 구현되어 있습니다.

따라서 기존 Pixel Agents의 다음 기능은 그대로 유지됩니다.

- 맵 렌더링
- 캐릭터 표시
- Agent 상태 표시
- WebSocket 연결
- hook route
- 기존 server route

---

### 3. 로컬 지식베이스 검색

`data/minwon-knowledge.json`에는 간단한 법령·사례·샘플 민원이 포함되어 있습니다.

검색 Agent는 입력 민원, 분류 결과, 핵심 쟁점을 기반으로 keyword score를 계산해 관련 법령과 유사 사례를 찾습니다.

---

## 빠른 실행 요약

처음 실행하는 경우:

```bash
npm install
npm run build
node dist/cli.js --port 3100
```

브라우저 접속:

```text
http://127.0.0.1:3100
```

새 터미널에서 실행:

```bash
node scripts/minwon-pipeline.mjs --sample 1
```

LLM 없이 테스트:

```bash
node scripts/minwon-pipeline.mjs --sample 1 --no-llm
```

---

## 문제 해결

### Pixel Agents 화면이 열리지 않는 경우

먼저 서버가 실행 중인지 확인합니다.

```bash
node dist/cli.js --port 3100
```

그다음 브라우저에서 아래 주소로 접속합니다.

```text
http://127.0.0.1:3100
```

---

### 파이프라인은 실행되지만 화면에 Agent가 안 보이는 경우

Pixel Agents 서버가 먼저 실행되어 있어야 합니다.

올바른 순서는 다음과 같습니다.

```text
1. node dist/cli.js --port 3100
2. 브라우저에서 http://127.0.0.1:3100 접속
3. node scripts/minwon-pipeline.mjs --sample 1 실행
```

---

### OpenRouter 호출이 실패하는 경우

`.env` 파일에 API Key가 있는지 확인합니다.

```env
OPENROUTER_API_KEY=your_openrouter_api_key_here
```

API Key 없이 테스트하려면 다음 명령을 사용합니다.

```bash
node scripts/minwon-pipeline.mjs --sample 1 --no-llm
```

---

### 실행 결과 파일을 Git에 올리고 싶지 않은 경우

실행 결과 파일은 이미 `.gitignore`에 등록되어 있습니다.

```gitignore
runs/*.json
runs/*.md
!runs/.gitkeep
```

따라서 `runs/` 폴더 구조만 유지되고, 실행 결과 파일은 GitHub에 업로드되지 않습니다.

---

## 활용 예시

이 프로젝트는 다음과 같은 상황에 활용할 수 있습니다.

- 공공 민원 처리 자동화 흐름 시각화
- 다중 Agent 협업 구조 설명
- 생성형 AI 기반 답변 초안 작성 프로토타입
- RAG 기반 행정 업무 보조 시스템 구조 실험
- AI Agent의 단계별 처리 과정을 비전공자에게 설명하는 데모

---

## 기술 스택

- Node.js
- TypeScript
- Fastify
- WebSocket
- Pixel Agents
- OpenRouter API
- Local JSON Knowledge Base

---

## 라이선스 및 참고

이 저장소는 Pixel Agents 프로젝트를 기반으로 민원 처리 Multi-Agent 파이프라인을 연동한 확장 구현입니다.

원본 Pixel Agents의 구조와 UI를 유지하면서, 공공 민원 처리 흐름을 시각화하기 위한 endpoint, pipeline script, local knowledge base를 추가했습니다.
