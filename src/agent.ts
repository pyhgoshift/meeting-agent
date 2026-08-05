import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import { startWatcher } from './collector/watcher.js';
import { transcribe } from './transcribe/whisper.js';
import { analyzeMeeting } from './extract/analyzer.js';
import { enrichWithFinancialData } from './extract/financial-enricher.js';
import { sendMeetingResult } from './distributor/slack.js';
import { saveMeetingToNotion } from './distributor/notion.js';
import { saveMeetingToGSheets } from './distributor/gsheets.js';
import { startDashboardServer } from './dashboard/server.js';
import { appendHistoryRecord } from './dashboard/history.js';

const WATCH_DIR = process.env.WATCH_DIR ?? './recordings';

if (!fs.existsSync(WATCH_DIR)) {
  fs.mkdirSync(WATCH_DIR, { recursive: true });
}

console.log('🚀 Meeting Agent 시작');
console.log(`📁 감시 경로: ${WATCH_DIR}`);
console.log('─'.repeat(50));

startWatcher(WATCH_DIR, async (filePath: string) => {
  const fileName = path.basename(filePath);
  const startTime = Date.now();

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

    console.log(`[2.5/4] 💹 금융 데이터 보강 중... (financial-datasets MCP)`);
    const financialContext = await enrichWithFinancialData(analysis, text);
    if (financialContext) {
      console.log(`       ✅ 완료 (티커: ${financialContext.tickers.join(', ')})`);
      (analysis as Record<string, unknown>).financialContext = financialContext;
    } else {
      console.log(`       ⏭️  금융 키워드 없음, 건너뜀`);
    }

    console.log(`[3/4] 💬 Slack 전송 중...`);
    await sendMeetingResult(analysis, fileName);
    console.log(`       ✅ 완료`);

    console.log(`[4/4] 📝 Notion 저장 중...`);
    const notionUrl = await saveMeetingToNotion(analysis, fileName, durationSec);
    console.log(`       ✅ 완료 → ${notionUrl}`);

    console.log(`[5/5] 📊 구글 시트 누적 기록 중...`);
    await saveMeetingToGSheets(analysis, fileName);
    console.log(`       ✅ 완료`);

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
      durationSec: Number(elapsed)
    });

  } catch (err) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`\n❌ 오류 발생 [${fileName}]:`, (err as Error).message);
    
    appendHistoryRecord(WATCH_DIR, {
      fileName,
      processedAt: new Date().toISOString(),
      status: 'error',
      error: (err as Error).message,
      durationSec: Number(elapsed)
    });
    
    throw err; // watcher가 재처리 허용하도록
  }
});

// 시작: 대시보드 서버 
const port = Number(process.env.DASHBOARD_PORT ?? 3000);
startDashboardServer(port);
