import type { MeetingAnalysis } from '../extract/analyzer.js';
import type { DistributionStep } from '../dashboard/history.js';
import { sendMeetingResult } from './slack.js';
import { saveMeetingToNotion } from './notion.js';
import { saveMeetingToGSheets } from './gsheets.js';
import { saveMeetingToCalendar } from './gcal.js';

/**
 * 회의록을 배포처 네 곳으로 보낸다.
 *
 * 자동 전송(분석 직후)과 수동 전송(대시보드에서 검토 후)이 같은 코드를 쓰도록 뽑아냈다.
 * 두 경로가 각자 구현되면 한쪽만 고쳐지는 일이 반드시 생긴다.
 */

export interface PublishResult {
  steps: DistributionStep[];
  notionUrl?: string;
}

export interface PublishInput {
  analysis: MeetingAnalysis;
  fileName: string;
  durationSec: number;
  transcript: string;
  recordedAt: Date;
}

/**
 * 슬랙·노션·시트는 실패 시 예외를 올린다. 자동 경로에서는 그 예외로 워처가 재처리하고,
 * 수동 경로에서는 호출부가 잡아 사용자에게 알린다.
 * 캘린더만 예외를 던지지 않는다 — 일정 하나 때문에 회의 전체를 다시 처리할 이유가 없다.
 */
export async function publishMeeting(input: PublishInput): Promise<PublishResult> {
  const { analysis, fileName, durationSec, transcript, recordedAt } = input;
  const steps: DistributionStep[] = [];

  const track = async <T>(name: DistributionStep['name'], fn: () => Promise<T>): Promise<T> => {
    try {
      const result = await fn();
      steps.push({ name, status: 'ok' });
      return result;
    } catch (e) {
      steps.push({ name, status: 'fail', detail: (e as Error).message });
      throw Object.assign(e as Error, { steps });
    }
  };

  console.log(`[1/4] 💬 Slack 전송 중...`);
  await track('slack', () => sendMeetingResult(analysis, fileName));
  console.log(`       ✅ 완료`);

  console.log(`[2/4] 📝 Notion 저장 중...`);
  const notionUrl = await track('notion', () =>
    saveMeetingToNotion(analysis, fileName, durationSec, transcript));
  console.log(`       ✅ 완료 → ${notionUrl}`);

  console.log(`[3/4] 📊 구글 시트 누적 기록 중...`);
  await track('sheets', () => saveMeetingToGSheets(analysis, fileName, recordedAt));
  console.log(`       ✅ 완료`);

  console.log(`[4/4] 🗓️ 구글 캘린더 연동 중...`);
  const calendar = await saveMeetingToCalendar(analysis, fileName, recordedAt);
  steps.push({ name: 'calendar', status: calendar.status, detail: calendar.detail });
  console.log(`       ${calendar.status === 'ok' ? '✅' : calendar.status === 'skip' ? '⏭️' : '❌'} ${calendar.detail ?? ''}`);

  return { steps, notionUrl };
}
