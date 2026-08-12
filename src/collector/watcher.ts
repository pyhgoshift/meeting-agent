import chokidar from 'chokidar';
import path from 'path';
import fs from 'fs';
import PQueue from 'p-queue';

// 지원 오디오 포맷
const AUDIO_EXTENSIONS = new Set(['.mp3', '.m4a', '.wav', '.ogg', '.flac', '.aac', '.opus', '.amr', '.awb', '.3gp']);

// 폰의 녹음기 폴더에는 회의만 들어있지 않다. 통화 녹음이 같은 폴더에 섞여 동기화되면
// 개인 통화가 전사되어 슬랙·노션·시트로 전부 퍼진다. 폴더 이름이 아니라 파일 이름으로
// 걸러야 한다 — 삼성 기본 녹음기는 '통화 녹음 홍길동_251213_113258.m4a' 형태로 저장한다.
// 구분자는 공백일 수도 _ 나 - 일 수도 있다 (call_recording_2026.m4a 같은 이름)
const DEFAULT_IGNORE_NAME = /통화[\s_-]*녹음|call[\s_-]*recording|recording[\s_-]*call|voice[\s_-]*call/i;

function buildIgnorePattern(): RegExp {
  const custom = process.env.IGNORE_FILE_PATTERN?.trim();
  if (!custom) return DEFAULT_IGNORE_NAME;
  try {
    return new RegExp(custom, 'i');
  } catch (e) {
    // 잘못된 정규식으로 컨테이너가 재시작 루프에 빠지면 안 된다
    console.error(`⚠️ IGNORE_FILE_PATTERN 이 올바른 정규식이 아닙니다. 기본값을 사용합니다: ${(e as Error).message}`);
    return DEFAULT_IGNORE_NAME;
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

    if (IGNORE_NAME.test(fileName)) {
      processed.add(filePath); // 매 스캔마다 같은 로그가 반복되지 않게 기억해 둔다
      console.log(`⏭️  건너뜀 (통화 녹음으로 판단): ${fileName}`);
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
