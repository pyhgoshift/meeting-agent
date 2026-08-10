import Groq from 'groq-sdk';
import fs from 'fs';
import path from 'path';
import { splitAudio, cleanupChunks } from './chunker.js';

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

  const start = Date.now();
  let fullText = '';
  
  if (fileSizeMB > 25) {
    console.log(`⚠️  파일 크기(${fileSizeMB.toFixed(1)}MB)가 25MB를 초과하여 자동 분할 처리를 시작합니다.`);
    const { chunkPaths } = await splitAudio(absPath, 1200); // 20분(1200초) 단위 분할
    
    try {
      for (let i = 0; i < chunkPaths.length; i++) {
        console.log(`       🧠 AI 변환 중... (${i + 1}/${chunkPaths.length})`);
        const response = await groq.audio.transcriptions.create({
          file: fs.createReadStream(chunkPaths[i]),
          model: MODEL,
          language: 'ko',
          response_format: 'json',
        });
        fullText += response.text + ' ';
      }
    } finally {
      console.log(`       🧹 임시 분할 파일 정리 중...`);
      cleanupChunks(chunkPaths);
    }
  } else {
    const response = await groq.audio.transcriptions.create({
      file: fs.createReadStream(absPath),
      model: MODEL,
      language: 'ko',
      response_format: 'json',
    });
    fullText = response.text;
  }

  const durationSec = (Date.now() - start) / 1000;

  return {
    text: fullText.trim(),
    durationSec,
    filePath: absPath,
  };
}
