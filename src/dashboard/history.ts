import fs from 'fs';
import path from 'path';

/** 배포처 한 곳의 처리 결과. skip은 설정이 없거나 보낼 내용이 없어 건너뛴 경우다. */
export interface DistributionStep {
  name: 'slack' | 'notion' | 'sheets' | 'calendar';
  status: 'ok' | 'fail' | 'skip';
  detail?: string; // 실패 사유 또는 건너뛴 이유
}

export interface MeetingHistoryRecord {
  fileName: string;
  title?: string;
  processedAt: string;
  status: 'success' | 'error';
  error?: string;
  durationSec: number;
  /** 배포처별 결과. 전체가 'success'여도 캘린더만 조용히 실패할 수 있어서 따로 남긴다. */
  steps?: DistributionStep[];
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
