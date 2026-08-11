import { Client } from '@notionhq/client';
import type { BlockObjectRequest } from '@notionhq/client/build/src/api-endpoints.js';
import type { MeetingAnalysis } from '../extract/analyzer.js';

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const DATABASE_ID = process.env.NOTION_DATABASE_ID ?? '';

// ─── 텍스트 2000자 제한 (Notion rich_text 제한) ─────────────────
function rt(content: string) {
  return [{ type: 'text' as const, text: { content: content.slice(0, 2000) } }];
}

// ─── 회의 결과 → Notion DB 저장 ─────────────────────────────────
export async function saveMeetingToNotion(
  analysis: MeetingAnalysis,
  fileName: string,
  durationSec: number,
  rawText: string = '',
): Promise<string> {
  // 날짜: schedules에서 추출, 없으면 오늘
  const meetingDate =
    analysis.datetime?.split(' ')[0] ??
    analysis.schedules.find((s) => s.date)?.date ??
    new Date().toISOString().split('T')[0];

  // 결정사항 텍스트
  const decisionsText = analysis.decisions.length
    ? analysis.decisions.map((d, i) => `${i + 1}. ${d}`).join('\n')
    : '없음';

  // 할일 텍스트
  const todosText = analysis.todos.length
    ? analysis.todos
        .map((t) => {
          const who = t.assignee ? ` [${t.assignee}]` : '';
          const when = t.due ? ` (~${t.due})` : '';
          return `• ${t.task}${who}${when}`;
        })
        .join('\n')
    : '없음';

  // 참석자 (schedules에서 중복 제거 및 attendees 병합)
  const allAttendees = new Set([...analysis.attendees, ...analysis.schedules.flatMap((s) => s.attendees ?? [])]);
  const attendees = [...allAttendees].join(', ') || '정보 없음';

  // DB 행 생성
  const page = await notion.pages.create({
    parent: { database_id: DATABASE_ID },
    properties: {
      이름: {
        title: rt(analysis.title || fileName.replace(/\.[^/.]+$/, '')),
      },
      날짜: {
        date: { start: meetingDate },
      },
      요약: {
        rich_text: rt(analysis.summary),
      },
      결정사항: {
        rich_text: rt(decisionsText),
      },
      할일: {
        rich_text: rt(todosText),
      },
      참석자: {
        rich_text: rt(attendees),
      },
      파일명: {
        rich_text: rt(fileName),
      },
      '처리시간(초)': {
        number: Math.round(durationSec),
      },
    },
    // 페이지 본문: 상세 내용
    children: buildBody(analysis, rawText),
  });

  return (page as unknown as { url: string }).url;
}

// ─── 페이지 본문 블록 빌더 ───────────────────────────────────────
function buildBody(analysis: MeetingAnalysis, rawText: string): BlockObjectRequest[] {
  const blocks: BlockObjectRequest[] = [];

  blocks.push(h2('📝 요약'), para(analysis.summary), divider());

  if (analysis.keyRemarks?.length) {
    blocks.push(h2('🗣️ 주요 발언'));
    analysis.keyRemarks.forEach((r) => blocks.push(bullet(r)));
    blocks.push(divider());
  }

  if (analysis.qna?.length) {
    blocks.push(h2('❓ 질의 응답'));
    analysis.qna.forEach((q) => {
      blocks.push(bullet(`Q: ${q.question}`));
      blocks.push(bullet(`A: ${q.answer}`));
    });
    blocks.push(divider());
  }

  if (analysis.decisions.length) {
    blocks.push(h2('✅ 결정사항'));
    analysis.decisions.forEach((d) => blocks.push(bullet(d)));
    blocks.push(divider());
  }

  if (analysis.todos.length) {
    blocks.push(h2('📌 할일 (Action Items)'));
    analysis.todos.forEach((t) => {
      const label = [
        t.task,
        t.assignee ? `[담당: ${t.assignee}]` : '',
        t.due ? `(기한: ${t.due})` : '',
      ]
        .filter(Boolean)
        .join(' ');
      blocks.push(todo(label));
    });
    blocks.push(divider());
  }

  if (analysis.schedules.length || analysis.nextMeeting) {
    blocks.push(h2('📅 일정'));
    if (analysis.nextMeeting) {
      blocks.push(bullet(`[차기 회의] ${analysis.nextMeeting} (장소: ${analysis.nextVenue || '미정'})`));
    }
    analysis.schedules.forEach((s) => {
      const parts = [s.title, s.date, s.attendees?.join(', ')].filter(Boolean);
      blocks.push(bullet(parts.join(' | ')));
    });
    blocks.push(divider());
  }

  // 원문 토글 (2000자씩 분할)
  if (rawText) {
    const rawChunks = [];
    let remaining = rawText;
    while (remaining.length > 0) {
      rawChunks.push(remaining.substring(0, 1999));
      remaining = remaining.substring(1999);
    }
    
    blocks.push({
      object: 'block',
      type: 'toggle',
      toggle: {
        rich_text: rt('💬 원문 스크립트 보기 (Raw Transcript)'),
        children: rawChunks.map(chunk => para(chunk))
      }
    });
  }

  return blocks;
}

// ─── 블록 헬퍼 ───────────────────────────────────────────────────
const h2 = (text: string) => ({
  object: 'block' as const,
  type: 'heading_2' as const,
  heading_2: { rich_text: rt(text) },
});

const para = (text: string) => ({
  object: 'block' as const,
  type: 'paragraph' as const,
  paragraph: { rich_text: rt(text) },
});

const bullet = (text: string) => ({
  object: 'block' as const,
  type: 'bulleted_list_item' as const,
  bulleted_list_item: { rich_text: rt(text) },
});

const todo = (text: string) => ({
  object: 'block' as const,
  type: 'to_do' as const,
  to_do: { rich_text: rt(text), checked: false },
});

const divider = () => ({
  object: 'block' as const,
  type: 'divider' as const,
  divider: {},
});
