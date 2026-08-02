import fs from 'fs';
import path from 'path';

export interface MeetingHistoryRecord {
  fileName: string;
  title?: string;
  processedAt: string;
  status: 'success' | 'error';
  error?: string;
  durationSec: number;
}

export function appendHistoryRecord(watchDir: string, record: MeetingHistoryRecord): void {
  const historyPath = path.join(watchDir, '.history.json');
  const tempPath = path.join(watchDir, '.history.json.tmp');

  let history: MeetingHistoryRecord[] = [];
  if (fs.existsSync(historyPath)) {
    try {
      const data = fs.readFileSync(historyPath, 'utf-8');
      history = JSON.parse(data);
    } catch (e) {
      console.warn('⚠️ 과거 처리 기록 파싱 실패. 새로 시작합니다.');
    }
  }

  history.unshift(record); // Add to beginning (latest first)
  if (history.length > 200) {
    history = history.slice(0, 200);
  }

  try {
    fs.writeFileSync(tempPath, JSON.stringify(history, null, 2), 'utf-8');
    fs.renameSync(tempPath, historyPath);
  } catch (e) {
    console.error('❌ 처리 기록 저장 실패:', e);
  }
}

export function readHistory(watchDir: string, limit: number = 50): MeetingHistoryRecord[] {
  const historyPath = path.join(watchDir, '.history.json');
  if (!fs.existsSync(historyPath)) return [];
  
  try {
    const data = fs.readFileSync(historyPath, 'utf-8');
    const history: MeetingHistoryRecord[] = JSON.parse(data);
    return history.slice(0, limit);
  } catch (e) {
    return [];
  }
}
