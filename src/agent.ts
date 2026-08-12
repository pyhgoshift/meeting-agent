import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import { startWatcher } from './collector/watcher.js';
import { transcribe } from './transcribe/whisper.js';
import { analyzeMeeting } from './extract/analyzer.js';
import { sendMeetingResult } from './distributor/slack.js';
import { saveMeetingToNotion } from './distributor/notion.js';
import { saveMeetingToGSheets } from './distributor/gsheets.js';
import { startDashboardServer } from './dashboard/server.js';
import { appendHistoryRecord, readHistory, type DistributionStep } from './dashboard/history.js';
import { saveMeetingToCalendar } from './distributor/gcal.js';

/** 배포처 호출을 감싸 결과를 steps에 남긴다. 실패 시 예외는 그대로 올려보내
 *  기존 재처리 동작(watcher가 파일을 다시 집는다)을 바꾸지 않는다. */
async function track<T>(
  steps: DistributionStep[],
  name: DistributionStep['name'],
  fn: () => Promise<T>
): Promise<T> {
  try {
    const result = await fn();
    steps.push({ name, status: 'ok' });
    return result;
  } catch (e) {
    steps.push({ name, status: 'fail', detail: (e as Error).message });
    throw e;
  }
}

const WATCH_DIR = process.env.WATCH_DIR ?? './recordings';

/** 같은 파일을 몇 번까지 다시 시도할지. 초과하면 .failed/ 로 격리한다. */
const MAX_ATTEMPTS = 3;

if (!fs.existsSync(WATCH_DIR)) {
  fs.mkdirSync(WATCH_DIR, { recursive: true });
}

console.log('🚀 Meeting Agent 시작');
console.log(`📁 감시 경로: ${WATCH_DIR}`);
console.log('─'.repeat(50));

startWatcher(WATCH_DIR, async (filePath: string) => {
  const fileName = path.basename(filePath);
  const startTime = Date.now();
  const steps: DistributionStep[] = [];

  try {
    console.log(`\n[1/4] 🎙️  음성 변환 중... (${fileName})`);
    const { text, durationSec } = await transcribe(filePath);
    console.log(`       ✅ 완료 (${durationSec.toFixed(1)}초 분량)`);

    console.log(`[2/4] 🤖 AI 분석 중... (DeepSeek)`);
    let customPrompt = undefined;
    const promptPath = path.join(WATCH_DIR, 'meetingbot_prompt.txt');
    if (fs.existsSync(promptPath)) {
      customPrompt = fs.readFileSync(promptPath, 'utf-8').trim();
      console.log(`       💡 외부 프롬프트(meetingbot_prompt.txt) 적용 완료`);
    }
    const analysis = await analyzeMeeting(text, customPrompt);
    console.log(`       ✅ 완료`);

    console.log(`[3/6] 💬 Slack 전송 중...`);
    await track(steps, 'slack', () => sendMeetingResult(analysis, fileName));
    console.log(`       ✅ 완료`);

    console.log(`[4/6] 📝 Notion 저장 중...`);
    const notionUrl = await track(steps, 'notion', () =>
      saveMeetingToNotion(analysis, fileName, durationSec, text));
    console.log(`       ✅ 완료 → ${notionUrl}`);

    console.log(`[5/6] 📊 구글 시트 누적 기록 중...`);
    await track(steps, 'sheets', () => saveMeetingToGSheets(analysis, fileName));
    console.log(`       ✅ 완료`);

    console.log(`[6/6] 🗓️ 구글 캘린더 연동 중...`);
    // 캘린더는 예외를 던지지 않고 결과를 돌려준다 (일정 하나 때문에 재처리하지 않기 위해)
    const calendar = await saveMeetingToCalendar(analysis, fileName);
    steps.push({ name: 'calendar', status: calendar.status, detail: calendar.detail });
    console.log(`       ${calendar.status === 'ok' ? '✅' : calendar.status === 'skip' ? '⏭️' : '❌'} ${calendar.detail ?? ''}`);

    // ─── 폰 용량 확보용 자동 아카이브 ───
    const archiveDir = path.join(WATCH_DIR, '.archive');
    if (!fs.existsSync(archiveDir)) fs.mkdirSync(archiveDir, { recursive: true });
    
    const archivePath = path.join(archiveDir, fileName);
    fs.renameSync(filePath, archivePath);
    console.log(`[5/5] 📦 자동 아카이브 완료 (폰 용량 확보)`);
    console.log(`       ✅ 이동됨: ${archivePath}`);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n✨ 완료: ${fileName} (총 ${elapsed}초)`);
    console.log('─'.repeat(50));

    appendHistoryRecord(WATCH_DIR, {
      fileName,
      title: analysis?.title,
      processedAt: new Date().toISOString(),
      status: 'success',
      durationSec: Number(elapsed),
      steps
    });

  } catch (err) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`\n❌ 오류 발생 [${fileName}]:`, (err as Error).message);

    appendHistoryRecord(WATCH_DIR, {
      fileName,
      processedAt: new Date().toISOString(),
      status: 'error',
      error: (err as Error).message,
      durationSec: Number(elapsed),
      steps
    });

    // 실패하면 파일이 아카이브되지 않고 감시 폴더에 남는다. 워처는 시작할 때 폴더를
    // 다시 훑으므로(ignoreInitial: false), 계속 실패하는 파일은 컨테이너가 재시작될
    // 때마다 음성 변환과 AI 분석 비용을 다시 지불하며 무한히 재처리된다.
    // 설정 오류처럼 저절로 낫지 않는 실패는 몇 번 시도한 뒤 손을 떼야 한다.
    const failures = readHistory(WATCH_DIR, 200)
      .filter(r => r.fileName === fileName && r.status === 'error').length;

    if (failures >= MAX_ATTEMPTS) {
      const failedDir = path.join(WATCH_DIR, '.failed');
      try {
        if (!fs.existsSync(failedDir)) fs.mkdirSync(failedDir, { recursive: true });
        fs.renameSync(filePath, path.join(failedDir, fileName));
        console.error(`⛔ ${failures}회 실패 — 재시도를 멈추고 .failed/ 로 옮겼습니다: ${fileName}`);
        console.error(`   원인을 고친 뒤 파일을 감시 폴더로 되돌리면 다시 처리됩니다.`);
      } catch (moveErr) {
        console.error(`⚠️ .failed/ 이동 실패:`, (moveErr as Error).message);
      }
      return; // 재처리 루프를 끊는다
    }

    console.error(`   재시도 예정 (${failures}/${MAX_ATTEMPTS}회 실패)`);
    throw err; // watcher가 재처리 허용하도록
  }
});

// 시작: 대시보드 서버 
const port = Number(process.env.DASHBOARD_PORT ?? 3000);
startDashboardServer(port);
