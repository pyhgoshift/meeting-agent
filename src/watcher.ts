import 'dotenv/config';
import chokidar from 'chokidar';
import path from 'path';
import { transcribe } from './transcribe/whisper.js';
import { analyzeMeeting } from './extract/analyzer.js';
import { sendMeetingResult } from './distributor/slack.js';
import { saveMeetingToNotion } from './distributor/notion.js';

const WATCH_DIR = process.env.WATCH_DIR ?? 'D:\\Pyhgoshift\\recording\\SynologyDrive';
const AUDIO_EXT = ['.mp3', '.m4a', '.wav', '.ogg'];

const processing = new Set<string>();

async function processFile(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (!AUDIO_EXT.includes(ext)) return;
  if (processing.has(filePath)) return;

  processing.add(filePath);
  const fileName = path.basename(filePath);

  console.log(`\n[새 파일 감지] ${fileName}`);

  try {
    console.log(`[1/4] 음성 변환 중...`);
    const { text, durationSec } = await transcribe(filePath);
    console.log(`      완료 (${durationSec.toFixed(1)}초)`);

    console.log(`[2/4] AI 분석 중...`);
    const analysis = await analyzeMeeting(text);
    console.log(`      완료`);

    console.log(`[3/4] Slack 전송 중...`);
    await sendMeetingResult(analysis, fileName);
    console.log(`      완료`);

    console.log(`[4/4] Notion 저장 중...`);
    const url = await saveMeetingToNotion(analysis, fileName, durationSec);
    console.log(`      완료 → ${url}`);

    console.log(`✅ 처리 완료: ${fileName}`);
  } catch (err) {
    console.error(`❌ 처리 실패: ${fileName}`, err);
  } finally {
    processing.delete(filePath);
  }
}

console.log(`감시 시작: ${WATCH_DIR}`);
console.log(`대상 확장자: ${AUDIO_EXT.join(', ')}\n`);

chokidar
  .watch(WATCH_DIR, {
    persistent: true,
    ignoreInitial: true,      // 시작 시 기존 파일 무시
    awaitWriteFinish: {
      stabilityThreshold: 3000, // 파일 쓰기 완료 후 3초 대기
      pollInterval: 500,
    },
  })
  .on('add', (filePath) => processFile(filePath));
