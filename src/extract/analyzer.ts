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
  title: z.string(),
  attendees: z.array(z.string()),
  agenda: z.string(),
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
  "title": "회의 핵심 주제를 반영한 짧은 제목 (10자 내외)",
  "attendees": ["참석자1", "참석자2"],
  "agenda": "회의 안건 (주제)",
  "summary": "회의 전체 요약 (3~5문장 한국어)",
  "decisions": ["결정사항1", "결정사항2"],
  "todos": [
    { "task": "할일 내용", "assignee": "담당자 이름", "due": "YYYY-MM-DD" }
  ],
  "schedules": [
    { "title": "일정 제목", "date": "YYYY-MM-DD", "attendees": ["참석자"] }
  ]
}`;

export async function analyzeMeeting(transcript: string, customPrompt?: string, retries = 1): Promise<MeetingAnalysis> {
  const kst = new Date();
  kst.setHours(kst.getHours() + 9);
  const currentDate = kst.toISOString().split('T')[0];
  const currentTime = kst.toISOString().split('T')[1].substring(0, 5);
  
  let dynamicPrompt = `${SYSTEM_PROMPT}

[중요: 날짜 계산 기준]
- 현재 한국 시간: ${currentDate} ${currentTime}
- 대화에서 '내일', '다음주', '수요일' 등 상대적인 시점이 언급되면 위 기준 날짜를 바탕으로 정확한 날짜(YYYY-MM-DD)를 계산해서 넣으세요.
- 절대로 임의의 과거/미래 날짜(예: 2025년 1월)를 지어내지 마세요. 날짜를 유추할 수 없는 경우 빈 문자열("")을 반환하세요.`;

  if (customPrompt) {
    dynamicPrompt += `\n\n[사용자 특별 지시사항 (가장 높은 우선순위로 적용할 것)]\n${customPrompt}`;
  }

  const raw = await chat(dynamicPrompt, `회의 전사본:\n${transcript}`);

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    if (retries > 0) return analyzeMeeting(transcript, customPrompt, retries - 1);
    throw new Error(`JSON 파싱 실패. 모델 원문:\n${raw}`);
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return MeetingSchema.parse(parsed);
  } catch {
    if (retries > 0) return analyzeMeeting(transcript, customPrompt, retries - 1);
    throw new Error(`스키마 검증 실패. 모델 원문:\n${raw}`);
  }
}
