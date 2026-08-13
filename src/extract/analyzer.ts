import { z } from 'zod';
import { chatDeepSeek as chat } from '../llm/providers/deepseek.js';
import { formatKST } from '../utils/recording-date.js';

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

const QnASchema = z.object({
  question: z.string(),
  answer: z.string(),
});

// ── 경기도교육청 표준 회의록 양식 대응 ──────────────────────────
// 양식은 참석자를 소속 기관별로 묶고(수요기관 / 추진단 / PMO / 사업단),
// 회의 내용을 □ 대주제 → - 소주제 → Ÿ 세부항목 3단으로 적는다.
// 기존 flat 필드(attendees, summary)는 그대로 두고 선택 필드로 추가해
// 예전 기록이나 양식이 안 잡히는 회의도 그대로 동작하게 한다.

const AttendeeGroupSchema = z.object({
  org: z.string(),               // 소속 (예: 수요기관, PMO, 사업단)
  members: z.array(z.string()),
});

const SubTopicSchema = z.object({
  name: z.string(),              // - 소주제
  points: z.array(z.string()),   // Ÿ 세부 항목
});

const ContentSectionSchema = z.object({
  topic: z.string(),                      // □ 대주제
  subtopics: z.array(SubTopicSchema),
});

const MeetingSchema = z.object({
  title: z.string(),
  datetime: z.string().optional(),
  venue: z.string().optional(),
  attendees: z.array(z.string()),
  attendeeGroups: z.array(AttendeeGroupSchema).optional(),
  absentees: z.array(z.string()).optional(),
  agenda: z.string(),
  summary: z.string(),
  contents: z.array(ContentSectionSchema).optional(),
  requests: z.array(z.string()).optional(),
  keyRemarks: z.array(z.string()).optional(),
  qna: z.array(QnASchema).optional(),
  decisions: z.array(z.string()),
  todos: z.array(TodoSchema),
  schedules: z.array(ScheduleSchema),
  nextMeeting: z.string().optional(),
  nextVenue: z.string().optional(),
});

export type MeetingAnalysis = z.infer<typeof MeetingSchema>;

const SYSTEM_PROMPT = `당신은 회의록 분석 전문가입니다.
주어진 회의 전사본을 분석하여 반드시 아래 JSON 형식으로만 응답하세요.
마크다운 코드블록 없이 순수 JSON만 출력하세요.

결과물은 공공기관 표준 회의록 양식으로 옮겨집니다. 특히 아래 세 필드를 신경 써서 채우세요.
- attendeeGroups: 참석자를 소속 기관/조직별로 묶습니다. 전사본에서 소속이 드러나지 않으면
  이 필드는 빈 배열로 두고 attendees만 채우세요. 소속을 임의로 지어내지 마세요.
- contents: 회의 내용을 "대주제 → 소주제 → 세부 항목" 3단으로 구조화합니다.
  대주제는 회의에서 다룬 큰 갈래(예: 시스템 구성 특이사항), 소주제는 그 안의 개별 대상
  (예: 개별 시스템/부서/사안), 세부 항목은 그에 대해 오간 논의를 한 줄씩 적습니다.
  summary와 중복되어도 무방합니다. summary는 줄글, contents는 개조식으로 작성하세요.
- requests: 회의에서 나온 요청 사항과 질의 사항을 한 줄씩 담습니다.
  결정된 것이 아니라 "해달라"거나 "확인이 필요하다"고 언급된 것들입니다.

{
  "title": "회의 핵심 주제를 반영한 제목",
  "datetime": "YYYY-MM-DD HH:MM (회의 일시가 언급된 경우, 유추할 수 없으면 빈 문자열)",
  "venue": "회의 장소 (언급된 경우)",
  "attendees": ["참석자1", "참석자2"],
  "attendeeGroups": [
    { "org": "소속/기관명 (예: 수요기관, PMO, 사업단)", "members": ["이름1", "이름2"] }
  ],
  "absentees": ["불참자1"],
  "agenda": "회의 안건 (주제)",
  "summary": "회의 전체 흐름과 맥락을 파악할 수 있는 상세한 요약 (시간순 또는 안건별로 매우 상세히 기술. 3~5줄 제한 없음. 길이가 긴 회의의 경우 최대한 구체적이고 길게 작성하세요.)",
  "contents": [
    {
      "topic": "대주제 (회의에서 다룬 큰 갈래)",
      "subtopics": [
        { "name": "소주제 (대상 시스템/사안 이름)", "points": ["세부 논의 내용 한 줄", "또 다른 세부 내용"] }
      ]
    }
  ],
  "requests": ["요청 사항이나 질의 사항 한 줄"],
  "keyRemarks": ["(발언자A) : 중요한 발언 내용", "(발언자B) : 발언 내용"],
  "qna": [
    { "question": "질문 내용", "answer": "답변 내용" }
  ],
  "decisions": ["결정사항1", "결정사항2"],
  "todos": [
    { "task": "할일 내용", "assignee": "담당자 이름", "due": "YYYY-MM-DD" }
  ],
  "schedules": [
    { "title": "일정 제목", "date": "YYYY-MM-DD", "attendees": ["참석자"] }
  ],
  "nextMeeting": "다음 회의 일시 (YYYY-MM-DD HH:MM)",
  "nextVenue": "다음 회의 장소"
}`;

export async function analyzeMeeting(
  transcript: string,
  customPrompt?: string,
  recordedAt?: Date,
  retries = 1,
): Promise<MeetingAnalysis> {
  // 상대 날짜의 기준은 '회의한 날'이어야 한다. 처리한 날이 아니다.
  // 몇 달 전 녹음을 뒤늦게 올리면 '다음 주'가 그만큼 통째로 밀렸다.
  const base = recordedAt ?? new Date();
  const meetingDateTime = formatKST(base);

  let dynamicPrompt = `${SYSTEM_PROMPT}

[중요: 날짜 계산 기준]
- 이 회의가 열린 시각(한국 시간): ${meetingDateTime}
- 대화에서 '내일', '다음주', '수요일' 등 상대적인 시점이 언급되면 반드시 위 '회의가 열린 시각'을
  기준으로 계산하세요. 지금 날짜가 아니라 회의 당일이 기준입니다.
- datetime 필드에는 위 회의 시각을 그대로 넣으세요. 대화 중에 다른 일시가 명시된 경우에만 그것을 쓰세요.
- 절대로 임의의 과거/미래 날짜를 지어내지 마세요. 날짜를 유추할 수 없는 경우 빈 문자열("")을 반환하세요.`;

  if (customPrompt) {
    dynamicPrompt += `\n\n[사용자 특별 지시사항 (가장 높은 우선순위로 적용할 것)]\n${customPrompt}`;
  }

  const raw = await chat(dynamicPrompt, `회의 전사본:\n${transcript}`);

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    if (retries > 0) return analyzeMeeting(transcript, customPrompt, recordedAt, retries - 1);
    throw new Error(`JSON 파싱 실패. 모델 원문:\n${raw}`);
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return MeetingSchema.parse(parsed);
  } catch {
    if (retries > 0) return analyzeMeeting(transcript, customPrompt, recordedAt, retries - 1);
    throw new Error(`스키마 검증 실패. 모델 원문:\n${raw}`);
  }
}
