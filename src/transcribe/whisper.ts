import Groq from 'groq-sdk';
import fs from 'fs';
import path from 'path';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MODEL = process.env.GROQ_STT_MODEL ?? 'whisper-large-v3-turbo';

export interface TranscriptResult {
  text: string;
  durationSec: number;
  filePath: string;
}

export async function transcribe(filePath: string): Promise<TranscriptResult> {
  const absPath = path.resolve(filePath);

  if (!fs.existsSync(absPath)) {
    throw new Error(`파일 없음: ${absPath}`);
  }

  const stat = fs.statSync(absPath);
  const fileSizeMB = stat.size / (1024 * 1024);

  if (fileSizeMB > 25) {
    throw new Error(`파일 크기 초과 (${fileSizeMB.toFixed(1)}MB). 25MB 이하 파일만 지원. ffmpeg 청크 분할 필요.`);
  }

  const start = Date.now();

  const response = await groq.audio.transcriptions.create({
    file: fs.createReadStream(absPath),
    model: MODEL,
    language: 'ko',
    response_format: 'json',
  });

  const durationSec = (Date.now() - start) / 1000;

  return {
    text: response.text,
    durationSec,
    filePath: absPath,
  };
}
