import 'dotenv/config';
import path from 'path';
import { transcribe } from './transcribe/whisper.js';
import { analyzeMeeting } from './extract/analyzer.js';
import { enrichWithFinancialData } from './extract/financial-enricher.js';
import { sendMeetingResult } from './distributor/slack.js';
import { saveMeetingToNotion } from './distributor/notion.js';

const filePath = process.argv[2];

if (!filePath) {
  console.error('사용법: npx tsx src/pipeline.ts <녹음파일경로>');
  process.exit(1);
}

const fileName = path.basename(filePath);

console.log(`[1/3] 음성 변환 중... (${fileName})`);
const { text, durationSec } = await transcribe(filePath);
console.log(`      완료 (${durationSec.toFixed(1)}초)`);

console.log(`[2/4] AI 분석 중... (DeepSeek)`);
let customPrompt = undefined;
const fs = await import('fs');
const promptPath = path.join(process.cwd(), 'meetingbot_prompt.txt');
if (fs.existsSync(promptPath)) {
  customPrompt = fs.readFileSync(promptPath, 'utf-8').trim();
}
const analysis = await analyzeMeeting(text, customPrompt);
console.log(`      완료`);

console.log(`[2.5/4] 금융 데이터 보강 중... (financial-datasets MCP)`);
const financialContext = await enrichWithFinancialData(analysis, text);
if (financialContext) {
  console.log(`       완료 (티커: ${financialContext.tickers.join(', ')})`);
  (analysis as Record<string, unknown>).financialContext = financialContext;
} else {
  console.log(`       금융 키워드 없음, 건너뜀`);
}

console.log(`[3/4] Slack 전송 중...`);
await sendMeetingResult(analysis, fileName);
console.log(`      완료`);

console.log(`[4/4] Notion 저장 중...`);
const notionUrl = await saveMeetingToNotion(analysis, fileName, durationSec);
console.log(`      완료 → ${notionUrl}`);

console.log(`\n✅ 파이프라인 완료: ${fileName}`);
console.log(`   Notion: ${notionUrl}`);
