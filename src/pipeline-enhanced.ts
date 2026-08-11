import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { transcribeAuto } from './transcribe/chunked.js';
import { analyzeStructured } from './extract/structured-analyzer.js';
import { sendStructuredMeeting } from './distributor/slack-enhanced.js';
import { saveStructuredMeetingToNotion } from './distributor/notion-enhanced.js';
import { createMeeting, saveMeetingTitle, saveTranscript, startSummary, completeSummary, failSummary } from './db/meeting-store.js';
import type { Mode } from './llm/router.js';

const filePath = process.argv[2];
const modeArg = (process.argv[3]?.replace('--mode=', '') as Mode) ?? (process.env.DEFAULT_MODE as Mode) ?? 'hybrid';

if (!filePath) {
  console.error('사용법: npx tsx src/pipeline-enhanced.ts <녹음파일> [--mode=fast|smart|hybrid|auto]');
  process.exit(1);
}

const fileName  = path.basename(filePath);
const meetingId = crypto.randomUUID();

console.log(`\n[meeting-agent enhanced] ${fileName} (mode: ${modeArg})`);
console.log(`  meeting_id: ${meetingId}`);

createmeetingId(meetingId, fileName, modeArg);
startSummary(meetingId);

let durationSec = 0;

try {
  console.log(`\n[1/4] 음성 변환 중...`);
  const { text, durationSec: sttDur } = await transcribeAuto(filePath);
  durationSec = sttDur;
  console.log(`      완료 (${sttDur.toFixed(1)}초, ${text.length}자)`);
  saveTranscript(meetingId, text, sttDur);

  let customPrompt: string | undefined;
  const promptPath = path.join(process.cwd(), 'meetingbot_prompt.txt');
  if (fs.existsSync(promptPath)) customPrompt = fs.readFileSync(promptPath, 'utf-8').trim();

  console.log(`\n[2/4] AI 분석 중... (mode: ${modeArg})`);
  const { analysis, modelUsed, costUsd, chunks } = await analyzeStructured(text, modeArg, customPrompt);
  console.log(`      완료 (${chunks}청크, 모델: ${modelUsed}, 비용: $${costUsd.toFixed(4)})`);

  saveMeetingTitle(meetingId, analysis.MeetingName || fileName);
  completeSummary(meetingId, analysis, modelUsed, costUsd);

  console.log(`\n[3/4] Slack 전송 중...`);
  await sendStructuredMeeting(analysis, fileName, modelUsed, costUsd);
  console.log(`      완료`);

  console.log(`\n[4/4] Notion 저장 중...`);
  const notionUrl = await saveStructuredMeetingToNotion(analysis, fileName, durationSec, modelUsed, costUsd);
  console.log(`      완료 → ${notionUrl}`);

  console.log(`\n✅ 파이프라인 완료`);
  console.log(`   회의명:  ${analysis.MeetingName || fileName}`);
  console.log(`   모델:    ${modelUsed}`);
  console.log(`   비용:    $${costUsd.toFixed(4)}`);
  console.log(`   Notion:  ${notionUrl}`);

} catch (err) {
  const msg = (err as Error).message;
  failSummary(meetingId, msg);
  console.error(`\n❌ 파이프라인 실패: ${msg}`);
  process.exit(1);
}
