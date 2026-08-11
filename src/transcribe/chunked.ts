import { transcribe, TranscriptResult } from './whisper.js';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const CHUNK_DURATION_SEC = 600;

function hasFfmpeg(): boolean {
  try { execSync('ffmpeg -version', { stdio: 'ignore' }); return true; } catch { return false; }
}

function splitAudio(filePath: string, tmpDir: string): string[] {
  const ext = path.extname(filePath);
  execSync(`ffmpeg -i "${filePath}" -f segment -segment_time ${CHUNK_DURATION_SEC} -c copy "${path.join(tmpDir, `chunk_%03d${ext}`)}" -y`, { stdio: 'ignore' });
  return fs.readdirSync(tmpDir).filter(f => f.startsWith('chunk_')).sort().map(f => path.join(tmpDir, f));
}

export async function transcribeAuto(filePath: string): Promise<TranscriptResult> {
  const fileSizeMB = fs.statSync(path.resolve(filePath)).size / (1024 * 1024);
  if (fileSizeMB <= 25) return transcribe(filePath);
  if (!hasFfmpeg()) throw new Error(`파일 크기 ${fileSizeMB.toFixed(1)}MB 초과. ffmpeg를 설치하세요.`);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meeting-chunks-'));
  try {
    const chunks = splitAudio(filePath, tmpDir);
    console.log(`  [chunked STT] ${chunks.length}개 청크로 분할 처리 중...`);
    const texts: string[] = [];
    for (let i = 0; i < chunks.length; i++) {
      console.log(`  [chunked STT] 청크 ${i + 1}/${chunks.length}...`);
      texts.push((await transcribe(chunks[i])).text);
    }
    return { text: texts.join('\n'), durationSec: 0, filePath: path.resolve(filePath) };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
