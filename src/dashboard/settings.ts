import fs from 'fs';
import path from 'path';

/**
 * 대시보드에서 바꿀 수 있는 설정.
 *
 * .env 가 아니라 별도 파일에 두는 이유: 환경변수는 컨테이너가 시작할 때 한 번만 읽혀서
 * 값을 바꾸려면 매번 재배포해야 한다. 전송 방식처럼 그때그때 바꾸는 설정은 파일에 두고
 * 매 회의마다 다시 읽는다.
 */

export interface Settings {
  /** true 면 분석이 끝나는 즉시 전 배포처로 보낸다. false 면 검토 대기 상태로 보관한다. */
  autoPublish: boolean;
}

const DEFAULTS: Settings = {
  autoPublish: true, // 지금까지의 동작을 기본값으로 둔다
};

function settingsPath(watchDir: string): string {
  return path.join(watchDir, '.settings.json');
}

export function readSettings(watchDir: string): Settings {
  const p = settingsPath(watchDir);
  if (!fs.existsSync(p)) return { ...DEFAULTS };

  try {
    const parsed = JSON.parse(fs.readFileSync(p, 'utf-8'));
    return { ...DEFAULTS, ...parsed };
  } catch (e) {
    console.error('⚠️ 설정 파일 파싱 실패, 기본값을 사용합니다:', (e as Error).message);
    return { ...DEFAULTS };
  }
}

export function writeSettings(watchDir: string, patch: Partial<Settings>): Settings {
  const next = { ...readSettings(watchDir), ...patch };
  const p = settingsPath(watchDir);
  const tmp = `${p}.tmp`;

  // 임시 파일에 쓴 뒤 교체한다. 쓰는 도중 죽어도 설정이 깨지지 않게.
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2), 'utf-8');
  fs.renameSync(tmp, p);

  return next;
}
