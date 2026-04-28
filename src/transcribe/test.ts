import 'dotenv/config';
import { transcribe } from './whisper.js';

const filePath = process.argv[2];

if (!filePath) {
  console.error('사용법: npx tsx src/transcribe/test.ts <녹음파일경로>');
  process.exit(1);
}

console.log(`변환 시작: ${filePath}`);

const result = await transcribe(filePath);

console.log(`\n완료 (${result.durationSec.toFixed(1)}초 소요)`);
console.log('─'.repeat(50));
console.log(result.text);
