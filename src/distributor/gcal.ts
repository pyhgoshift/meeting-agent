import { calendar, auth } from '@googleapis/calendar';
import fs from 'fs';
import type { MeetingAnalysis } from '../extract/analyzer.js';

const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID;
const KEY_PATH = process.env.GOOGLE_SERVICE_KEY_PATH;

/** 캘린더 연동 결과. 실패해도 예외를 던지지 않는다 — 일정 하나 때문에 회의 전체를
 *  재처리(=음성 변환·분석 비용 재지불)할 이유가 없기 때문이다. 대신 결과를 돌려주어
 *  대시보드에 남긴다. 예전엔 여기서 조용히 삼켜서 실패를 알 방법이 로그밖에 없었다. */
export type CalendarOutcome = { status: 'ok' | 'fail' | 'skip'; detail?: string };

export async function saveMeetingToCalendar(analysis: MeetingAnalysis, fileName: string): Promise<CalendarOutcome> {
  if (!CALENDAR_ID || !KEY_PATH) {
    const detail = '설정 누락 (GOOGLE_CALENDAR_ID / GOOGLE_SERVICE_KEY_PATH)';
    console.log(`       ⚠️ 구글 캘린더 ${detail} — 연동을 건너뜁니다.`);
    return { status: 'skip', detail };
  }

  if (!fs.existsSync(KEY_PATH)) {
    const detail = `서비스 계정 키 파일 없음: ${KEY_PATH}`;
    console.error(`       ❌ ${detail}`);
    return { status: 'fail', detail };
  }

  let cal;
  try {
    const authClient = new auth.GoogleAuth({
      keyFile: KEY_PATH,
      scopes: ['https://www.googleapis.com/auth/calendar.events'],
    });
    cal = calendar({ version: 'v3', auth: authClient });
  } catch (e: any) {
    const detail = `인증 실패 (키 파일이 올바른 서비스 계정 JSON인지 확인): ${e.message}`;
    console.error(`       ❌ ${detail}`);
    return { status: 'fail', detail };
  }

  // schedules 와 nextMeeting을 모두 통합하여 이벤트로 생성
  const eventsToCreate = [];

  // 1. 차기 회의 (nextMeeting)
  if (analysis.nextMeeting) {
    eventsToCreate.push({
      title: `[차기 회의] ${analysis.title || fileName}`,
      date: analysis.nextMeeting,
      description: `이전 회의결과: ${analysis.summary}`,
      location: analysis.nextVenue || '',
    });
  }

  // 2. 일반 일정 (schedules)
  if (analysis.schedules && analysis.schedules.length > 0) {
    analysis.schedules.forEach(s => {
      if (s.date) {
        eventsToCreate.push({
          title: s.title,
          date: s.date,
          description: `참석자: ${s.attendees?.join(', ') || '미정'}\n출처: ${fileName}`,
          location: '',
        });
      }
    });
  }

  if (eventsToCreate.length === 0) {
    console.log('       📅 등록할 일정이 없습니다.');
    return { status: 'skip', detail: '회의에서 추출된 일정이 없음' };
  }

  let created = 0;
  let skippedDate = 0;
  const failures: string[] = [];

  for (const event of eventsToCreate) {
    // date가 'YYYY-MM-DD HH:MM' 형태인지 파싱
    let startDate: Date;
    let endDate: Date;
    
    try {
      startDate = new Date(event.date);
      if (isNaN(startDate.getTime())) { skippedDate++; continue; } // 유효하지 않은 날짜 건너뛰기

      // 기본적으로 1시간짜리 일정으로 등록
      endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
    } catch (e) {
      skippedDate++;
      continue; // 파싱 실패 시 건너뛰기
    }

    try {
      await cal.events.insert({
        calendarId: CALENDAR_ID,
        requestBody: {
          summary: event.title,
          description: event.description,
          location: event.location,
          start: {
            dateTime: startDate.toISOString(),
            timeZone: 'Asia/Seoul',
          },
          end: {
            dateTime: endDate.toISOString(),
            timeZone: 'Asia/Seoul',
          },
        },
      });
      created++;
      console.log(`       ✅ 캘린더 등록 완료: ${event.title}`);
    } catch (e: any) {
      // 403/404는 거의 항상 "서비스 계정에 캘린더를 공유하지 않음"이다.
      // 원인이 로그에만 남으면 못 찾으므로 안내를 결과에 실어 보낸다.
      const hint = (e.code === 403 || e.code === 404 || /not found|forbidden/i.test(e.message ?? ''))
        ? ' — 캘린더를 서비스 계정 이메일(키 파일의 client_email)에 "일정 변경" 권한으로 공유했는지 확인하세요'
        : '';
      failures.push(`${event.title}: ${e.message}${hint}`);
      console.error(`       ❌ 캘린더 등록 실패 (${event.title}):`, e.message + hint);
    }
  }

  if (failures.length > 0) {
    return { status: 'fail', detail: `${created + failures.length}건 중 ${failures.length}건 실패 · ${failures[0]}` };
  }
  if (created === 0) {
    return { status: 'skip', detail: `날짜를 해석할 수 없는 일정 ${skippedDate}건만 있었음` };
  }
  return {
    status: 'ok',
    detail: `${created}건 등록${skippedDate > 0 ? ` (날짜 불명 ${skippedDate}건 제외)` : ''}`,
  };
}
