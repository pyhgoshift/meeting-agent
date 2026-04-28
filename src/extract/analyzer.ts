import { z } from 'zod';
import { chat } from '../llm/providers/deepseek.js';

const TodoSchema = z.object({
  task: z.string(),
  assignee: z.string().optional(),
  due: z.string().optional(),
});

const ScheduleSchema = z.object({
  title: z.string(),
  date: z.string().optional(),
  attendees: z.array(z.string()).optional(),
});

const MeetingSchema = z.object({
  summary: z.string(),
  decisions: z.array(z.string()),
  todos: z.array(TodoSchema),
  schedules: z.array(ScheduleSchema),
});

export type MeetingAnalysis = z.infer<typeof MeetingSchema>;

const SYSTEM_PROMPT = `당신은 회의록 분석 전문가입니다.
주어진 회의 전사본을 분석하여 반드시 아래 JSON 형식으로만 응답하세요.
마크다운 코드블록 없이 순수 JSON만 출력하세요.

{
  "summary": "회의 전체 요약 (3~5문장 한국어)",
  "decisions": ["결정사항1", "결정사항2"],
  "todos": [
    { "task": "할일 내용", "assignee": "담당자 이름", "due": "YYYY-MM-DD" }
  ],
  "schedules": [
    { "title": "일정 제목", "date": "YYYY-MM-DD", "attendees": ["참석자"] }
  ]
}`;

export async function analyzeMeeting(transcript: string, retries = 1): Promise<MeetingAnalysis> {
  const raw = await chat(SYSTEM_PROMPT, `회의 전사본:\n${transcript}`);

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    if (retries > 0) return analyzeMeeting(transcript, retries - 1);
    throw new Error(`JSON 파싱 실패. 모델 원문:\n${raw}`);
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return MeetingSchema.parse(parsed);
  } catch {
    if (retries > 0) return analyzeMeeting(transcript, retries - 1);
    throw new Error(`스키마 검증 실패. 모델 원문:\n${raw}`);
  }
}
