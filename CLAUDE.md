## MCP 서버

### financial-datasets (금융 데이터)
- URL: http://mcp.financialdatasets.ai
- 등록: `claude mcp add --transport http financial-datasets http://mcp.financialdatasets.ai`
- 환경변수: `FINANCIAL_DATASETS_API_KEY` (선택), `FINANCIAL_DATASETS_MCP_URL` (기본값 사용 가능)
- 용도: 회의에서 주식 티커/금융 키워드 감지 시 실시간 주가·재무 데이터 보강
- 코드 위치:
  - 클라이언트: `src/llm/providers/financial-datasets.ts`
  - 보강 로직: `src/extract/financial-enricher.ts`
- 동작: 분석 결과에 금융 키워드가 없으면 자동으로 건너뜀 (비용 0)

---

## 기술 스택 결정 (Decision Log)

### 음성 → 텍스트: Groq Whisper
- 결정일: 2026-04-25
- 이유: OpenAI Whisper 대비 1/9 비용, 20배 빠름
- 트레이드오프: 없음 (동일 Whisper 모델, 인프라만 다름)
- 환경변수: GROQ_API_KEY

### AI 분석: NVIDIA NIM의 DeepSeek-V3
- 결정일: 2026-04-25
- 이유: Claude Sonnet 대비 비용 절감
- 트레이드오프:
  - 한국어 뉘앙스 정확도 약간 낮음
  - JSON 구조화 출력 안정성 약간 부족
- 대응:
  - JSON 파싱 실패 시 재시도 + 검증 로직 강화
  - 중요 결정사항은 Claude Haiku로 2차 검증 고려
- 환경변수: NVIDIA_API_KEY

### 폴백 전략
- DeepSeek 실패 시 Claude Haiku로 자동 폴백
- 아주 중요한 회의는 사용자가 명시적으로 "Claude" 옵션 선택

### 검토 시점
- 1개월 후 비용/정확도 재평가
- 정확도 불만족 시 Claude Haiku로 마이그레이션 고려

---

## LLM 라우터 설계

### 4가지 모드

**Mode 1: fast (빠른 처리)**
- 음성 변환: Groq Whisper
- 분석/추출: DeepSeek
- 용도: 일상 회의, 비공식 미팅
- 예상 비용: ~$0.05/회의

**Mode 2: smart (최고 정확도)**
- 음성 변환: Groq Whisper
- 분석/추출: Claude Sonnet
- 용도: 임원 회의, 중요 의사결정
- 예상 비용: ~$1.00/회의

**Mode 3: hybrid (기본값) ⭐**
- 음성 변환: Groq Whisper
- 1차 요약/분류: DeepSeek
- 결정사항 추출: Claude Sonnet (정확도 중요)
- JSON 구조화: Claude (안정성)
- MCP 통합 호출: Claude (필수)
- 예상 비용: ~$0.20/회의

**Mode 4: auto (자동 판단)**
- 회의 텍스트 길이/복잡도 자동 분석
- 키워드 감지로 중요도 판단
  - "결정", "확정", "예산", "법적" → smart로 격상
  - 그 외 → fast로 처리
- 예상 비용: 평균 $0.10/회의

### 사용 방식

CLI:
```
node process.js meeting.m4a --mode=hybrid
```

환경변수 기본값:
```
DEFAULT_MODE=hybrid
ENABLE_AUTO_FALLBACK=true
COST_LIMIT_PER_MEETING=0.50
```

코드:
```ts
processMeeting('meeting.m4a', {
  mode: 'hybrid',
  fallback: true,
  budget: 0.10
})
```

### 폴백 전략
- DeepSeek 실패 → Claude Haiku 재시도 → 그래도 실패 → 에러
- JSON 파싱 실패 → 같은 모델 1회 재시도 → 실패 시 Claude로 폴백
- Claude 실패 → DeepSeek로 폴백 (반대 방향, 가용성 최대화)

### 작업별 모델 매트릭스

| 작업 | fast | smart | hybrid | auto |
|------|------|-------|--------|------|
| 음성 변환 | Groq | Groq | Groq | Groq |
| 1차 요약 | DeepSeek | Claude S | DeepSeek | 길이 따라 |
| 결정사항 추출 | DeepSeek | Claude S | Claude S | 키워드 따라 |
| 일정/할일 추출 | DeepSeek | Claude S | DeepSeek | DeepSeek |
| JSON 구조화 | DeepSeek | Claude | Claude | Claude |
| Slack 메시지 작성 | DeepSeek | Claude H | Claude H | Claude H |
| 대시보드 요약 | DeepSeek | Claude H | DeepSeek | DeepSeek |

### 폴더 구조

```
src/
├── llm/
│   ├── router.ts          - 모드 선택 + 라우팅
│   ├── providers/
│   │   ├── deepseek.ts    - NVIDIA NIM 클라이언트
│   │   ├── claude.ts      - Anthropic 클라이언트
│   │   └── groq.ts        - Groq 클라이언트
│   ├── fallback.ts        - 자동 폴백 로직
│   └── cost-tracker.ts    - 비용 추적
├── transcribe/
└── extract/
```

### 검증 기준

각 모델 응답 검증:
1. JSON 파싱 가능?
2. 필수 필드 존재?
3. 한국어 응답?
4. 길이 적절?

실패 시 자동 폴백 발동.
