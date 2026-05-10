import 'dotenv/config';
import path from 'path';
import { startWatcher } from './collector/watcher.js';
import { transcribe } from './transcribe/whisper.js';
import { analyzeMeeting } from './extract/analyzer.js';
import { enrichWithFinancialData } from './extract/financial-enricher.js';
import { sendMeetingResult } from './distributor/slack.js';
import { saveMeetingToNotion } from './distributor/notion.js';

const WATCH_DIR = process.env.WATCH_DIR ?? './recordings';

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
    const analysis = await analyzeMeeting(text);
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

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n✨ 완료: ${fileName} (총 ${elapsed}초)`);
    console.log('─'.repeat(50));

  } catch (err) {
    console.error(`\n❌ 오류 발생 [${fileName}]:`, (err as Error).message);
    throw err; // watcher가 재처리 허용하도록
  }
});
