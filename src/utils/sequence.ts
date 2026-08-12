import fs from 'fs';
import path from 'path';

/**
 * 회의 일련번호(YYMMDD-NN). 원래 gsheets.ts 안에만 있던 로직을 꺼냈다.
 * 슬랙 회의록 머리말의 '회의 번호'와 구글 시트의 번호가 같은 값이어야
 * 나중에 둘을 대조할 수 있기 때문이다.
 *
 * peek()은 상태를 건드리지 않고 "다음에 부여될 번호"만 알려주고,
 * next()가 실제로 증가시켜 저장한다. 슬랙 전송이 시트 기록보다 먼저 일어나므로
 * 슬랙은 peek(), 시트는 next()를 쓴다.
 */

function seqFilePath(): string {
  const watchDir = process.env.WATCH_DIR ?? './recordings';
  return path.join(watchDir, '.sequence.json');
}

function todayKST(): string {
  const now = new Date();
  now.setHours(now.getHours() + 9);
  const yy = String(now.getUTCFullYear()).slice(-2);
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  return `${yy}${mm}${dd}`;
}

function readCount(dateStr: string): number {
  const p = seqFilePath();
  if (!fs.existsSync(p)) return 0;
  try {
    const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
    return data.date === dateStr ? data.count : 0;
  } catch {
    return 0; // 손상된 파일은 오늘 첫 회의로 취급한다
  }
}

function format(dateStr: string, num: number): string {
  return `${dateStr}-${String(num).padStart(2, '0')}`;
}

/** 상태를 바꾸지 않고 다음에 부여될 번호를 미리 본다. */
export function peekSequence(): string {
  const dateStr = todayKST();
  return format(dateStr, readCount(dateStr) + 1);
}

/** 번호를 실제로 하나 소비하고 저장한다. */
export function nextSequence(): string {
  const dateStr = todayKST();
  const num = readCount(dateStr) + 1;
  try {
    fs.writeFileSync(seqFilePath(), JSON.stringify({ date: dateStr, count: num }), 'utf-8');
  } catch (e) {
    console.error('⚠️ 회의 번호 저장 실패:', (e as Error).message);
  }
  return format(dateStr, num);
}
