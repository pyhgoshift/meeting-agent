import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import { startWatcher } from './collector/watcher.js';
import { transcribe } from './transcribe/whisper.js';
import { analyzeMeeting } from './extract/analyzer.js';
import { publishMeeting } from './distributor/publish.js';
import { startDashboardServer } from './dashboard/server.js';
import { readSettings } from './dashboard/settings.js';
import { makeDraftId, saveDraft } from './dashboard/pending.js';
import { appendHistoryRecord, readHistory, type DistributionStep } from './dashboard/history.js';
import { captureConsole } from './utils/logbuffer.js';
import { resolveRecordedAt, formatKST } from './utils/recording-date.js';

// 대시보드가 진행 상황을 보여줄 수 있도록 콘솔 출력을 버퍼에 함께 담는다.
// 첫 로그가 찍히기 전에 걸어야 시작 메시지부터 남는다.
captureConsole();

const WATCH_DIR = process.env.WATCH_DIR ?? './recordings';

/** 같은 파일을 몇 번까지 다시 시도할지. 초과하면 .failed/ 로 격리한다. */
const MAX_ATTEMPTS = 3;

if (!fs.existsSync(WATCH_DIR)) {
  fs.mkdirSync(WATCH_DIR, { recursive: true });
}

/** 처리가 끝난 녹음을 .archive 로 옮긴다 (폰 용량 확보 겸 재처리 방지). */
function archiveRecording(filePath: string, fileName: string): void {
  const archiveDir = path.join(WATCH_DIR, '.archive');
  if (!fs.existsSync(archiveDir)) fs.mkdirSync(archiveDir, { recursive: true });
  const archivePath = path.join(archiveDir, fileName);
  fs.renameSync(filePath, archivePath);
  console.log(`       📦 아카이브로 이동: ${archivePath}`);
}

console.log('🚀 Meeting Agent 시작');
console.log(`📁 감시 경로: ${WATCH_DIR}`);
console.log('─'.repeat(50));

startWatcher(WATCH_DIR, async (filePath: string) => {
  const fileName = path.basename(filePath);
  const startTime = Date.now();
  const steps: DistributionStep[] = [];

  // 상대 날짜('다음 주 화요일')의 기준이 되는 시점. 파일명에 박힌 녹음 시각을 쓰고,
  // 없으면 파일 수정 시각으로 떨어진다.
  const recordedAt = resolveRecordedAt(filePath);

  try {
    console.log(`\n[1/4] 🎙️  음성 변환 중... (${fileName})`);
    const { text, durationSec } = await transcribe(filePath);
    console.log(`       ✅ 완료 (${durationSec.toFixed(1)}초 분량)`);

    console.log(`[2/4] 🤖 AI 분석 중... (DeepSeek)`);
    console.log(`       📅 회의 시각 기준: ${formatKST(recordedAt)} ('다음 주' 같은 표현을 이 날짜로 계산)`);
    let customPrompt = undefined;
    const promptPath = path.join(WATCH_DIR, 'meetingbot_prompt.txt');
    if (fs.existsSync(promptPath)) {
      customPrompt = fs.readFileSync(promptPath, 'utf-8').trim();
      console.log(`       💡 외부 프롬프트(meetingbot_prompt.txt) 적용 완료`);
    }
    const analysis = await analyzeMeeting(text, customPrompt, recordedAt);
    console.log(`       ✅ 완료`);

    const { autoPublish } = readSettings(WATCH_DIR);

    if (!autoPublish) {
      // 수동 전송 모드 — 초안만 남기고 배포는 사용자가 대시보드에서 지시한다.
      // 초안을 먼저 안전하게 저장한 뒤에 음성을 옮긴다(순서가 반대면 초안 저장에
      // 실패했을 때 전사본도 음성도 없이 아무것도 안 남는다).
      const draftId = makeDraftId(fileName);
      saveDraft(WATCH_DIR, {
        id: draftId,
        fileName,
        recordedAt: recordedAt.toISOString(),
        createdAt: new Date().toISOString(),
        durationSec,
        analysis,
        transcript: text,
      });

      // 검토를 기다리는 동안 감시 폴더에 두면 재시작 때 같은 파일을 다시 전사한다
      archiveRecording(filePath, fileName);

      const held = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`\n📝 검토 대기로 보관했습니다 (자동 전송 꺼짐): ${analysis.title || fileName}`);
      console.log(`   대시보드 [검토 대기] 탭에서 확인하고 전송하세요.`);
      console.log('─'.repeat(50));

      appendHistoryRecord(WATCH_DIR, {
        fileName,
        title: analysis?.title,
        processedAt: new Date().toISOString(),
        status: 'success',
        durationSec: Number(held),
        steps: [{ name: 'slack', status: 'skip', detail: '검토 대기 중 — 대시보드에서 전송' }],
      });
      return;
    }

    // 자동 전송 — 배포가 끝난 뒤에 아카이브한다. 먼저 옮겨버리면 배포가 실패했을 때
    // 파일이 감시 폴더에 없어 재처리가 안 된다.
    const { steps: published } = await publishMeeting({
      analysis, fileName, durationSec, transcript: text, recordedAt,
    });
    steps.push(...published);

    archiveRecording(filePath, fileName);

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
