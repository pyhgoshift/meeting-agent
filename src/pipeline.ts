import 'dotenv/config';
import path from 'path';
import { transcribe } from './transcribe/whisper.js';
import { analyzeMeeting } from './extract/analyzer.js';
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
const analysis = await analyzeMeeting(text);
console.log(`      완료`);

console.log(`[3/4] Slack 전송 중...`);
await sendMeetingResult(analysis, fileName);
console.log(`      완료`);

console.log(`[4/4] Notion 저장 중...`);
const notionUrl = await saveMeetingToNotion(analysis, fileName, durationSec);
console.log(`      완료 → ${notionUrl}`);

console.log(`\n✅ 파이프라인 완료: ${fileName}`);
console.log(`   Notion: ${notionUrl}`);
