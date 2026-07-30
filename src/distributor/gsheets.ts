import fs from 'fs';
import path from 'path';
import { MeetingAnalysis } from '../extract/analyzer.js';

// 웹훅 URL 하드코딩 또는 환경변수 처리
const WEBHOOK_URL = process.env.GSHEETS_WEBHOOK_URL ?? 'https://script.google.com/macros/s/AKfycbwSroeYNVA5NrubKL8A2f5uFzITtBfv47SiwocZqxFPDB7x1ipwawrJusuECEsqhZD42g/exec';

function getNextSequence(): string {
  const WATCH_DIR = process.env.WATCH_DIR ?? './recordings';
  const seqFilePath = path.join(WATCH_DIR, '.sequence.json');
  
  const today = new Date();
  // 한국 시간(KST) 기준 날짜 문자열 생성 (YYMMDD)
  today.setHours(today.getHours() + 9);
  const yy = String(today.getUTCFullYear()).slice(-2);
  const mm = String(today.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(today.getUTCDate()).padStart(2, '0');
  const dateStr = `${yy}${mm}${dd}`;

  let nextNum = 1;

  if (fs.existsSync(seqFilePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(seqFilePath, 'utf-8'));
      if (data.date === dateStr) {
        nextNum = data.count + 1;
      }
    } catch (e) {
      // 무시하고 1부터 시작
    }
  }

  // 상태 저장
  fs.writeFileSync(seqFilePath, JSON.stringify({ date: dateStr, count: nextNum }), 'utf-8');

  return `${dateStr}-${String(nextNum).padStart(2, '0')}`;
}

export async function saveMeetingToGSheets(analysis: MeetingAnalysis, fileName: string): Promise<void> {
  if (!WEBHOOK_URL) {
    console.warn('⚠️ GSHEETS_WEBHOOK_URL이 설정되지 않아 구글 시트 저장을 건너뜁니다.');
    return;
  }

  const sequence = getNextSequence();
  const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const title = fileName; // 파일명을 제목으로 사용

  // 결정사항, 할일 배열을 보기 좋게 문자열로 포맷팅
  const decisionsStr = analysis.decisions.map((d, i) => `${i + 1}. ${d}`).join('\n');
  const todosStr = analysis.todos.map(t => {
    let str = `- ${t.task}`;
    if (t.assignee) str += ` (담당: ${t.assignee})`;
    if (t.due) str += ` (기한: ${t.due})`;
    return str;
  }).join('\n');

  const payload = {
    sequence,
    date,
    title,
    summary: analysis.summary,
    decisions: decisionsStr,
    todos: todosStr
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
