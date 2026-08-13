import chokidar from 'chokidar';
import path from 'path';
import fs from 'fs';
import PQueue from 'p-queue';

// 지원 오디오 포맷
const AUDIO_EXTENSIONS = new Set(['.mp3', '.m4a', '.wav', '.ogg', '.flac', '.aac', '.opus', '.amr', '.awb', '.3gp']);

// 제외 기준은 '폴더'다. Voice Recorder 에 들어온 파일은 통화 녹음이든 회의든 전부
// 사용자가 올린 것이므로 처리한다. 폰이 자동으로 백업하는 recording/Call 만 제외하며,
// 그건 아래 chokidar 의 ignored 규칙이 담당한다. 파일 이름으로는 거르지 않는다.
//
// 특정 이름을 빼야 할 일이 생기면 .env 에 IGNORE_FILE_PATTERN=정규식 을 넣으면 된다.
// 기본값은 '아무것도 거르지 않음'이다.
function buildIgnorePattern(): RegExp | null {
  const custom = process.env.IGNORE_FILE_PATTERN?.trim();
  if (!custom) return null;
  try {
    return new RegExp(custom, 'i');
  } catch (e) {
    // 잘못된 정규식으로 컨테이너가 재시작 루프에 빠지면 안 된다
    console.error(`⚠️ IGNORE_FILE_PATTERN 이 올바른 정규식이 아닙니다. 무시하고 전부 처리합니다: ${(e as Error).message}`);
    return null;
  }
}

const IGNORE_NAME = buildIgnorePattern();

// 처리 완료 파일 추적 (재처리 방지)
const processed = new Set<string>();

// 동시 처리 1개로 제한 (순차 처리)
const queue = new PQueue({ concurrency: 1 });

export interface WatcherStatus {
  ready: boolean;
  startedAt: string | null;
  fatalError: string | null;
  queueSize: number;
  queuePending: number;
}

const status: WatcherStatus = {
  ready: false,
  startedAt: null,
  fatalError: null,
  queueSize: 0,
  queuePending: 0
};

export function getWatcherStatus(): WatcherStatus {
  return {
    ...status,
    queueSize: queue.size,
    queuePending: queue.pending
  };
}

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

  watcher.on('ready', () => {
    status.ready = true;
    status.startedAt = new Date().toISOString();
  });

  watcher.on('add', (filePath: string) => {
    const ext = path.extname(filePath).toLowerCase();
    if (!AUDIO_EXTENSIONS.has(ext)) return;
    if (processed.has(filePath)) return;

    const fileName = path.basename(filePath);

    if (IGNORE_NAME?.test(fileName)) {
      processed.add(filePath); // 매 스캔마다 같은 로그가 반복되지 않게 기억해 둔다
      console.log(`⏭️  건너뜀 (IGNORE_FILE_PATTERN 일치): ${fileName}`);
      return;
    }

    processed.add(filePath);
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
    status.fatalError = (err as Error).message;
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
