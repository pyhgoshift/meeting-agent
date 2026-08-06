import { transcribe, TranscriptResult } from './whisper.js';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const CHUNK_DURATION_SEC = 600; // 10분 단위 분할

function hasFfmpeg(): boolean {
  try {
    execSync('ffmpeg -version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function splitAudio(filePath: string, tmpDir: string): string[] {
  const ext = path.extname(filePath);
  const chunkPattern = path.join(tmpDir, `chunk_%03d${ext}`);
  execSync(
    `ffmpeg -i "${filePath}" -f segment -segment_time ${CHUNK_DURATION_SEC} -c copy "${chunkPattern}" -y`,
    { stdio: 'ignore' },
  );
  return fs.readdirSync(tmpDir)
    .filter(f => f.startsWith('chunk_'))
    .sort()
    .map(f => path.join(tmpDir, f));
}

export async function transcribeAuto(filePath: string): Promise<TranscriptResult> {
  const stat = fs.statSync(path.resolve(filePath));
  const fileSizeMB = stat.size / (1024 * 1024);

  if (fileSizeMB <= 25) {
    return transcribe(filePath);
  }

  if (!hasFfmpeg()) {
    throw new Error(
      `파일 크기 ${fileSizeMB.toFixed(1)}MB 초과 (25MB 한도). ffmpeg가 없어 분할 불가. ffmpeg를 설치하세요.`,
    );
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meeting-chunks-'));
  try {
    const chunks = splitAudio(filePath, tmpDir);
    console.log(`  [chunked STT] ${chunks.length}개 청크로 분할 처리 중...`);

    const start = Date.now();
    const texts: string[] = [];

    for (let i = 0; i < chunks.length; i++) {
      console.log(`  [chunked STT] 청크 ${i + 1}/${chunks.length}...`);
      const r = await transcribe(chunks[i]);
      texts.push(r.text);
    }

    return {
      text: texts.join('\n'),
      durationSec: (Date.now() - start) / 1000,
      filePath: path.resolve(filePath),
    };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
