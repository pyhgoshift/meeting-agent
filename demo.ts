import 'dotenv/config';
import path from 'path';
import { transcribe } from './src/transcribe/whisper.js';
import type { MeetingAnalysis } from './src/extract/analyzer.js';

async function runDemo() {
  const filePath = '1.진짜오프닝.mp3';
  const fileName = path.basename(filePath);

  console.log(`\n==================================================`);
  console.log(`[🚀 데모 파이프라인 시작] 대상 파일: ${fileName}`);
  console.log(`==================================================\n`);

  // 1. 음성 변환 (실제 API 호출 - 작동 확인됨)
  console.log(`[1/4] 🎙️ 음성 변환 중 (Groq Whisper)...`);
  const { text, durationSec } = await transcribe(filePath);
  console.log(`      ✅ 변환 완료 (${durationSec.toFixed(1)}초)`);
  console.log(`      📝 원본 텍스트 미리보기: "${text.substring(0, 100)}..."\n`);

  // 2. AI 분석 (Mocking - NVIDIA NIM 403 에러 우회)
  console.log(`[2/4] 🧠 AI 분석 및 정보 추출 중 (Mocking DeepSeek)...`);
  // Mock 데이터
  const analysis: MeetingAnalysis = {
    summary: `[데모용 가상 요약] ${text.substring(0, 50)}... 의 내용을 바탕으로 회의가 진행되었습니다. 프로젝트 초기 세팅과 방향성에 대해 합의했습니다.`,
    decisions: ["AI 에이전트 초기 파이프라인 구조 확정", "Groq Whisper STT 모델 도입"],
    todos: [
      { task: "NVIDIA API 키 재발급 및 적용", assignee: "이노베이터 박", due: "2026-07-29" },
      { task: "Slack 및 Notion 연동 테스트", assignee: "시냅스 박", due: "2026-07-30" }
    ],
    schedules: [
      { title: "파이프라인 고도화 회의", date: "2026-08-01", attendees: ["프로이트 박", "파일럿 박", "고든 박"] }
    ]
  };
  await new Promise(r => setTimeout(r, 1500)); // 가상 딜레이
  console.log(`      ✅ 분석 완료\n`);

  // 3. Slack 분배 시뮬레이션
  console.log(`[3/4] 💬 Slack 메시지 분배 시뮬레이션 (Console Output)`);
  console.log(`      --------------------------------------------------`);
  console.log(`      [Slack Channel: #ai-meeting-logs]`);
  console.log(`      📋 회의록 분석 결과`);
  console.log(`      파일: \`${fileName}\`\n`);
  console.log(`      *요약*`);
  console.log(`      ${analysis.summary}\n`);
  console.log(`      *✅ 결정사항*`);
  analysis.decisions.forEach(d => console.log(`      • ${d}`));
  console.log(`\n      *📌 할일*`);
  analysis.todos.forEach(t => console.log(`      • ${t.task} *[${t.assignee}]* (~${t.due})`));
  console.log(`\n      *📅 일정*`);
  analysis.schedules.forEach(s => console.log(`      • ${s.title} - ${s.date} (참석: ${s.attendees?.join(', ')})`));
  console.log(`      --------------------------------------------------\n`);

  // 4. Notion 분배 시뮬레이션
  console.log(`[4/4] 📝 Notion DB 적재 시뮬레이션 (Console Output)`);
  console.log(`      --------------------------------------------------`);
  console.log(`      [Notion Database: Meeting Records]`);
  console.log(`      행 추가됨:`);
  console.log(`      - 이름: ${fileName.replace('.mp3', '')}`);
  console.log(`      - 날짜: ${analysis.schedules[0].date}`);
  console.log(`      - 파일명: ${fileName}`);
  console.log(`      - 처리시간(초): ${Math.round(durationSec)}`);
  console.log(`      ✅ 저장 완료 → https://notion.so/mock-page-url`);
  console.log(`      --------------------------------------------------\n`);

  console.log(`🎉 모든 파이프라인 데모가 성공적으로 완료되었습니다!`);
}

runDemo().catch(console.error);
