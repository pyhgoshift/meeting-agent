import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
// @ts-ignore
import ffprobeStatic from 'ffprobe-static';

// ffmpeg 경로 설정
if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic as unknown as string);
}
if (ffprobeStatic && ffprobeStatic.path) {
  ffmpeg.setFfprobePath(ffprobeStatic.path);
}

export interface ChunkerResult {
  chunkPaths: string[];
  totalDurationSec: number;
}

/**
 * 오디오 파일의 메타데이터(길이)를 가져옵니다.
 */
function getAudioDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      const duration = metadata.format.duration;
      if (duration === undefined) return reject(new Error('오디오 길이를 알 수 없습니다.'));
      resolve(duration);
    });
  });
}

/**
 * 대용량 오디오 파일을 일정 시간(기본 20분) 단위로 분할합니다.
 * @param filePath 원본 파일 경로
 * @param chunkDurationSec 분할 단위 (초), 기본 1200초(20분)
 */
export async function splitAudio(filePath: string, chunkDurationSec: number = 1200): Promise<ChunkerResult> {
  const duration = await getAudioDuration(filePath);
  const chunkPaths: string[] = [];

  const parsedPath = path.parse(filePath);
  const tempDir = path.join(parsedPath.dir, '.temp_chunks');
  
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const numChunks = Math.ceil(duration / chunkDurationSec);
  
  console.log(`\n✂️  대용량 오디오 분할 시작 (${(duration/60).toFixed(1)}분 -> ${numChunks}조각)`);

  for (let i = 0; i < numChunks; i++) {
    const chunkPath = path.join(tempDir, `${parsedPath.name}_chunk_${i}${parsedPath.ext}`);
    const startTime = i * chunkDurationSec;
    
    // 마지막 청크는 남은 시간만큼
    const currentChunkDuration = (i === numChunks - 1) ? (duration - startTime) : chunkDurationSec;
    
    await new Promise<void>((resolve, reject) => {
      ffmpeg(filePath)
        .setStartTime(startTime)
        .setDuration(currentChunkDuration)
        .output(chunkPath)
        .on('end', () => {
          console.log(`       ✅ 조각 ${i + 1}/${numChunks} 생성 완료`);
          resolve();
        })
        .on('error', (err) => reject(err))
        .run();
    });
    
    chunkPaths.push(chunkPath);
  }

  return { chunkPaths, totalDurationSec: duration };
}

/**
 * 생성된 임시 청크 파일들과 폴더를 삭제합니다.
 */
export function cleanupChunks(chunkPaths: string[]) {
  for (const p of chunkPaths) {
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
    }
  }
  
  // 청크가 삭제된 후 .temp_chunks 디렉토리가 비어있으면 삭제
  if (chunkPaths.length > 0) {
    const tempDir = path.dirname(chunkPaths[0]);
    if (fs.existsSync(tempDir) && fs.readdirSync(tempDir).length === 0) {
      fs.rmdirSync(tempDir);
    }
  }
}
