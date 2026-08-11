import { google } from 'googleapis';
import fs from 'fs';
import type { MeetingAnalysis } from '../extract/analyzer.js';

const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID;
const KEY_PATH = process.env.GOOGLE_SERVICE_KEY_PATH;

export async function saveMeetingToCalendar(analysis: MeetingAnalysis, fileName: string): Promise<void> {
  if (!CALENDAR_ID || !KEY_PATH) {
    console.log('       ⚠️ 구글 캘린더 설정이 누락되어 연동을 건너뜁니다.');
    return;
  }

  if (!fs.existsSync(KEY_PATH)) {
    console.error(`❌ 구글 서비스 계정 키 파일을 찾을 수 없습니다: ${KEY_PATH}`);
    return;
  }

  const auth = new google.auth.GoogleAuth({
    keyFile: KEY_PATH,
    scopes: ['https://www.googleapis.com/auth/calendar.events'],
  });

  const calendar = google.calendar({ version: 'v3', auth });

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
    return;
  }

  for (const event of eventsToCreate) {
    // date가 'YYYY-MM-DD HH:MM' 형태인지 파싱
    let startDate: Date;
    let endDate: Date;
    
    try {
      startDate = new Date(event.date);
      if (isNaN(startDate.getTime())) continue; // 유효하지 않은 날짜 건너뛰기
      
      // 기본적으로 1시간짜리 일정으로 등록
      endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
    } catch (e) {
      continue; // 파싱 실패 시 건너뛰기
    }

    try {
      await calendar.events.insert({
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
      console.log(`       ✅ 캘린더 등록 완료: ${event.title}`);
    } catch (e: any) {
      console.error(`       ❌ 캘린더 등록 실패 (${event.title}):`, e.message);
    }
  }
}
