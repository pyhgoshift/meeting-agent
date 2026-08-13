#!/usr/bin/env node
/**
 * 봇이 슬랙에 올린 회의록 메시지를 찾아 지운다.
 *
 * 통화 녹음이 회의로 잘못 처리되어 개인 대화가 채널에 올라간 경우를 되돌리기 위한
 * 도구다. 슬랙 UI에서는 남이 올린(= 봇이 올린) 메시지를 지우기 어렵지만,
 * chat.delete 는 메시지를 올린 그 토큰으로 호출하면 지울 수 있다.
 *
 * 사용법 — NAS SSH 에서 컨테이너를 통해 실행한다(NAS 자체에는 node 가 없다).
 * 배포 디렉토리가 컨테이너의 /app/config 로 마운트되어 있어 이 경로로 닿는다.
 *
 *   sudo docker exec meeting-agent node /app/config/scripts/cleanup-slack.mjs "통화 녹음"
 *   sudo docker exec meeting-agent node /app/config/scripts/cleanup-slack.mjs "통화 녹음" --delete
 *
 * 인자로 준 문자열이 메시지 본문에 들어있으면 대상으로 잡는다.
 * 파일명 일부(예: 유은경)로 좁혀도 되고, "회의록 분석 완료" 로 전체를 훑어도 된다.
 *
 * 봇 토큰에 channels:history (비공개 채널이면 groups:history) 권한이 필요하다.
 */
import fs from 'fs';
import path from 'path';

const USAGE = 'sudo docker exec meeting-agent node /app/config/scripts/cleanup-slack.mjs';

// .env 를 직접 읽는다 (dotenv 의존성 없이 동작하도록)
function loadEnv() {
  const p = path.join(process.cwd(), '.env');
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf-8').split('\n')) {
    const eq = line.indexOf('=');
    if (eq === -1 || line.trimStart().startsWith('#')) continue;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (key && !process.env[key]) process.env[key] = val;
  }
}
loadEnv();

const TOKEN = process.env.SLACK_BOT_TOKEN;
const CHANNEL = process.env.SLACK_CHANNEL_ID;
const needle = process.argv[2];
const doDelete = process.argv.includes('--delete');

if (!TOKEN || !CHANNEL) {
  console.error('❌ .env 에서 SLACK_BOT_TOKEN / SLACK_CHANNEL_ID 를 찾지 못했습니다.');
  console.error('   배포 디렉토리(.env 가 있는 곳)에서 실행하세요.');
  process.exit(1);
}
if (!needle) {
  console.error(`사용법: ${USAGE} "찾을문구" [--delete]`);
  console.error(`예:    ${USAGE} "통화 녹음"`);
  console.error(`전체:  ${USAGE} "회의록 분석 완료"`);
  process.exit(1);
}

async function slack(method, params, post = false) {
  const url = `https://slack.com/api/${method}`;
  const res = post
    ? await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(params),
      })
    : await fetch(`${url}?${new URLSearchParams(params)}`, {
        headers: { Authorization: `Bearer ${TOKEN}` },
      });

  const data = await res.json();
  if (!data.ok) {
    const hint =
      data.error === 'missing_scope'   ? ` (필요 권한: ${data.needed ?? '알 수 없음'} — 슬랙 앱 설정에서 추가 후 재설치하세요)` :
      data.error === 'cant_delete_message' ? ' (이 토큰이 올린 메시지가 아닙니다)' :
      data.error === 'not_in_channel'  ? ' (봇을 해당 채널에 초대하세요)' : '';
    throw new Error(`${method} 실패: ${data.error}${hint}`);
  }
  return data;
}

// 채널 히스토리를 페이지 단위로 훑는다
const targets = [];
let cursor;
let scanned = 0;

do {
  const page = await slack('conversations.history', {
    channel: CHANNEL,
    limit: '200',
    ...(cursor ? { cursor } : {}),
  });

  for (const m of page.messages ?? []) {
    scanned++;
    const text = [m.text ?? '', ...(m.blocks ?? []).map(b => b.text?.text ?? '')].join('\n');
    if (text.includes(needle)) targets.push({ ts: m.ts, preview: text.replace(/\s+/g, ' ').slice(0, 90) });
  }

  cursor = page.response_metadata?.next_cursor;
} while (cursor);

console.log(`\n메시지 ${scanned}건을 훑어 "${needle}" 포함 ${targets.length}건을 찾았습니다.\n`);

if (targets.length === 0) process.exit(0);

for (const t of targets) {
  const when = new Date(Number(t.ts) * 1000).toLocaleString('ko-KR');
  console.log(`  [${when}] ${t.preview}…`);
}

if (!doDelete) {
  console.log(`\n※ 아직 아무것도 지우지 않았습니다.`);
  console.log(`   위 목록이 맞으면 --delete 를 붙여 다시 실행하세요:`);
  console.log(`   ${USAGE} "${needle}" --delete`);
  process.exit(0);
}

console.log(`\n삭제를 시작합니다...`);
let done = 0, failed = 0;
for (const t of targets) {
  try {
    await slack('chat.delete', { channel: CHANNEL, ts: t.ts }, true);
    done++;
  } catch (e) {
    failed++;
    console.error(`  ⚠️ ${t.ts}: ${e.message}`);
  }
  await new Promise(r => setTimeout(r, 1100)); // chat.delete 는 분당 50회 제한
}

console.log(`\n완료: ${done}건 삭제${failed ? `, ${failed}건 실패` : ''}`);
