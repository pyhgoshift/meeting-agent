import { z } from 'zod';

const BlockSchema = z.object({
  id: z.string(),
  type: z.enum(['text', 'bullet', 'heading1', 'heading2']),
  content: z.string(),
  color: z.string().default(''),
});

const SectionSchema = z.object({
  title: z.string(),
  blocks: z.array(BlockSchema),
});

const MeetingNotesSchema = z.object({
  meeting_name: z.string(),
  sections: z.array(SectionSchema),
});

export const MeetingAnalysisFullSchema = z.object({
  MeetingName: z.string(),
  People: SectionSchema,
  SessionSummary: SectionSchema,
  CriticalDeadlines: SectionSchema,
  KeyItemsDecisions: SectionSchema,
  ImmediateActionItems: SectionSchema,
  NextSteps: SectionSchema,
  MeetingNotes: MeetingNotesSchema,
});

export type MeetingAnalysisFull = z.infer<typeof MeetingAnalysisFullSchema>;
export type Section = z.infer<typeof SectionSchema>;
export type Block = z.infer<typeof BlockSchema>;

export const STRUCTURED_SYSTEM_PROMPT = `당신은 회의록 분석 전문가입니다.
주어진 회의 전사본(또는 그 일부)을 분석하여 반드시 아래 JSON 형식으로만 응답하세요.
마크다운 코드블록 없이 순수 JSON만 출력하세요.

Block type 규칙:
- "text": 일반 문단
- "bullet": 목록 항목
- "heading1": 대제목
- "heading2": 소제목

{
  "MeetingName": "회의 핵심 주제 제목 (한국어, 15자 이내)",
  "People": {
    "title": "참석자",
    "blocks": [{ "id": "p1", "type": "bullet", "content": "이름 (역할)", "color": "" }]
  },
  "SessionSummary": {
    "title": "회의 요약",
    "blocks": [{ "id": "s1", "type": "text", "content": "요약 내용", "color": "" }]
  },
  "CriticalDeadlines": {
    "title": "주요 마감일",
    "blocks": [{ "id": "d1", "type": "bullet", "content": "YYYY-MM-DD: 내용", "color": "" }]
  },
  "KeyItemsDecisions": {
    "title": "핵심 결정사항",
    "blocks": [{ "id": "k1", "type": "bullet", "content": "결정 내용", "color": "" }]
  },
  "ImmediateActionItems": {
    "title": "즉시 실행 항목",
    "blocks": [{ "id": "a1", "type": "bullet", "content": "[담당자] 할일 내용", "color": "" }]
  },
  "NextSteps": {
    "title": "다음 단계",
    "blocks": [{ "id": "n1", "type": "bullet", "content": "다음 단계 내용", "color": "" }]
  },
  "MeetingNotes": {
    "meeting_name": "회의 이름",
    "sections": [
      { "title": "섹션 제목", "blocks": [{ "id": "m1", "type": "text", "content": "내용", "color": "" }] }
    ]
  }
}`;
