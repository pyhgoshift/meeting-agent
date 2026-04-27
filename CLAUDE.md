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
