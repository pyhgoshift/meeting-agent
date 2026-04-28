import 'dotenv/config';
import { transcribe } from '../transcribe/whisper.js';
import { analyzeMeeting } from './analyzer.js';

const filePath = process.argv[2];

if (!filePath) {
  console.error('사용법: npx tsx src/extract/test.ts <녹음파일경로>');
  process.exit(1);
}

console.log(`1단계: 음성 변환 중...`);
const { text, durationSec } = await transcribe(filePath);
console.log(`완료 (${durationSec.toFixed(1)}초)\n`);

console.log(`2단계: AI 분석 중 (DeepSeek)...`);
const result = await analyzeMeeting(text);

console.log('\n' + '═'.repeat(50));
console.log('📋 요약');
console.log('═'.repeat(50));
console.log(result.summary);

console.log('\n' + '─'.repeat(50));
console.log('✅ 결정사항');
result.decisions.forEach((d, i) => console.log(`  ${i + 1}. ${d}`));

console.log('\n' + '─'.repeat(50));
console.log('📌 할일');
result.todos.forEach((t) => {
  const who = t.assignee ? ` [${t.assignee}]` : '';
  const when = t.due ? ` (~${t.due})` : '';
  console.log(`  • ${t.task}${who}${when}`);
});

console.log('\n' + '─'.repeat(50));
console.log('📅 일정');
if (result.schedules.length === 0) {
  console.log('  (추출된 일정 없음)');
} else {
  result.schedules.forEach((s) => {
    const date = s.date ? ` - ${s.date}` : '';
    console.log(`  • ${s.title}${date}`);
  });
}
console.log('═'.repeat(50));
