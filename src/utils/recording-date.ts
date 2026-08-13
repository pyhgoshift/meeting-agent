import fs from 'fs';
import path from 'path';

/**
 * 녹음이 "언제 이루어졌는지"를 알아낸다.
 *
 * 이게 왜 중요하냐면, 회의에서 "다음 주 화요일"이라고 말했을 때 그 기준은 회의한 날이지
 * 파일을 처리한 날이 아니기 때문이다. 예전에는 분석 시점의 오늘 날짜를 기준으로 삼아서,
 * 몇 달 전 녹음을 뒤늦게 올리면 상대 날짜가 통째로 어긋났다.
 *
 * 1순위: 파일 이름에 박힌 시각 (삼성 녹음기는 이름에 YYMMDD_HHMMSS 를 넣는다)
 * 2순위: 파일 수정 시각
 */

/** 파일 이름에서 녹음 시각을 뽑는다. 못 찾으면 null. */
export function parseRecordedAtFromName(fileName: string): Date | null {
  const base = path.basename(fileName);

  // 20260630_222836 / 20260630-222836 (연도 4자리)
  const long = base.match(/(?<!\d)(\d{4})(\d{2})(\d{2})[_-](\d{2})(\d{2})(\d{2})(?!\d)/);
  if (long) {
    const [, y, mo, d, h, mi, s] = long;
    return build(+y, +mo, +d, +h, +mi, +s);
  }

  // 250630_222836 (연도 2자리) — 삼성 기본 녹음기 형식
  const short = base.match(/(?<!\d)(\d{2})(\d{2})(\d{2})[_-](\d{2})(\d{2})(\d{2})(?!\d)/);
  if (short) {
    const [, y, mo, d, h, mi, s] = short;
    return build(2000 + +y, +mo, +d, +h, +mi, +s);
  }

  // 20260630 / 2026-06-30 (날짜만)
  const dateOnly = base.match(/(?<!\d)(\d{4})[-.]?(\d{2})[-.]?(\d{2})(?!\d)/);
  if (dateOnly) {
    const [, y, mo, d] = dateOnly;
    return build(+y, +mo, +d, 0, 0, 0);
  }

  return null;
}

/** 실제 존재하는 날짜인지 확인하며 만든다. 13월이나 32일 같은 건 걸러진다. */
function build(y: number, mo: number, d: number, h: number, mi: number, s: number): Date | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return null;

  // 벽시계 값 그대로 검증부터 한다 (2월 30일이 3월 2일로 넘어가는 것을 잡는다)
  const wall = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  if (wall.getUTCMonth() !== mo - 1 || wall.getUTCDate() !== d) return null;

  // 폰이 파일명에 적는 시각은 한국시간이다. 9시간을 빼야 실제 시점이 된다.
  const dt = new Date(wall.getTime() - 9 * 60 * 60 * 1000);

  // 미래이거나 터무니없이 과거면 파일명에서 우연히 걸린 숫자로 본다
  const now = Date.now();
  if (dt.getTime() > now + 86400000 || dt.getTime() < Date.UTC(2000, 0, 1)) return null;

  return dt;
}

/** 녹음 시각. 이름에서 못 찾으면 파일 수정 시각으로 떨어진다. */
export function resolveRecordedAt(filePath: string): Date {
  const fromName = parseRecordedAtFromName(filePath);
  if (fromName) return fromName;

  try {
    return fs.statSync(filePath).mtime;
  } catch {
    return new Date();
  }
}

/** 'YYYY-MM-DD HH:MM' (KST) — 프롬프트에 넣을 표기 */
export function formatKST(d: Date): string {
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const iso = kst.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}
