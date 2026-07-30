import chokidar from 'chokidar';
import path from 'path';
import fs from 'fs';
import PQueue from 'p-queue';

// 지원 오디오 포맷
const AUDIO_EXTENSIONS = new Set(['.mp3', '.m4a', '.wav', '.ogg', '.flac', '.aac', '.opus', '.amr', '.awb', '.3gp']);

// 처리 완료 파일 추적 (재처리 방지)
const processed = new Set<string>();

// 동시 처리 1개로 제한 (순차 처리)
const queue = new PQueue({ concurrency: 1 });

export function startWatcher(
  watchDir: string,
  onFile: (filePath: string) => Promise<void>,
): void {
  if (!fs.existsSync(watchDir)) {
    console.error(`❌ 감시 폴더 없음: ${watchDir}`);
    process.exit(1);
  }

  console.log(`👁️  폴더 감시 시작: ${watchDir}`);

  const watcher = chokidar.watch(watchDir, {
    persistent: true,
    ignoreInitial: false,        // 시작 시 기존 파일도 처리
    usePolling: true,            // 시놀로지 NAS inotify 버그 회피
    interval: 3000,              // 3초마다 폴더 스캔
    awaitWriteFinish: {
      stabilityThreshold: 3000,  // 3초간 변경 없으면 완료로 판단
      pollInterval: 1000,
    },
    ignored: [/(^|[\/\\])\../, /(^|[\/\\])Call($|[\/\\])/i], // .archive 등 숨김 폴더와 Call 폴더 무시
  });

  watcher.on('add', (filePath: string) => {
    const ext = path.extname(filePath).toLowerCase();
    if (!AUDIO_EXTENSIONS.has(ext)) return;
    if (processed.has(filePath)) return;

    processed.add(filePath);
    const fileName = path.basename(filePath);
    console.log(`\n🎙️  새 파일 감지: ${fileName}`);

    queue.add(async () => {
      try {
        await onFile(filePath);
      } catch (err) {
        console.error(`❌ 처리 실패 [${fileName}]:`, (err as Error).message);
        // 실패 시 재처리 허용
        processed.delete(filePath);
      }
    });
  });

  watcher.on('error', (err) => {
    console.error('👁️  감시 오류:', err);
  });

  // 종료 시 정리
  process.on('SIGINT', () => {
    console.log('\n⏹️  감시 종료');
    watcher.close();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    watcher.close();
    process.exit(0);
  });
}
