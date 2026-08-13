import fs from 'fs';
import path from 'path';
import { MeetingAnalysis } from '../extract/analyzer.js';
import { nextSequence } from '../utils/sequence.js';
import { formatKST } from '../utils/recording-date.js';

// 웹훅 URL 하드코딩 또는 환경변수 처리
const WEBHOOK_URL = process.env.GSHEETS_WEBHOOK_URL ?? 'https://script.google.com/macros/s/AKfycbwSroeYNVA5NrubKL8A2f5uFzITtBfv47SiwocZqxFPDB7x1ipwawrJusuECEsqhZD42g/exec';


export async function saveMeetingToGSheets(
  analysis: MeetingAnalysis,
  fileName: string,
  recordedAt?: Date,
): Promise<void> {
  if (!WEBHOOK_URL) {
    console.warn('⚠️ GSHEETS_WEBHOOK_URL이 설정되지 않아 구글 시트 저장을 건너뜁니다.');
    return;
  }

  const sequence = nextSequence();
  // 시트에 남는 날짜는 '회의한 날'이어야 한다. 예전에는 처리한 날을 적어서,
  // 몇 달 전 녹음을 뒤늦게 올리면 전부 오늘 날짜로 쌓였다.
  const date = formatKST(recordedAt ?? new Date()).slice(0, 10); // YYYY-MM-DD (KST)
  const title = analysis.title || fileName; // AI가 지어준 제목 우선 사용

  // 결정사항, 할일 배열을 보기 좋게 문자열로 포맷팅
  const attendeesStr = analysis.attendees?.join(', ') || '';
  const agendaStr = analysis.agenda || '';
  const decisionsStr = analysis.decisions.map((d, i) => `${i + 1}. ${d}`).join('\n');
  const tasksStr = analysis.todos.map(t => `- ${t.task}${t.assignee ? ` (담당: ${t.assignee})` : ''}`).join('\n');
  const dueStr = analysis.todos.map(t => t.due || '-').join('\n');

  const payload = {
    sequence,
    date,
    title,
    attendees: attendeesStr,
    agenda: agendaStr,
    summary: analysis.summary,
    decisions: decisionsStr,
    tasks: tasksStr,
    due: dueStr
  };

  try {
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`웹훅 전송 실패 (${response.status}): ${text}`);
    }
  } catch (err) {
    console.error(`❌ 구글 시트 저장 실패:`, (err as Error).message);
    throw err;
  }
}
