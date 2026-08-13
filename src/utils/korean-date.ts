/**
 * 한국어로 적힌 날짜를 읽는다.
 *
 * 프롬프트는 YYYY-MM-DD 로 달라고 하지만 모델은 "26년 8월 17일" 처럼 돌려줄 때가 많고,
 * 사람이 대시보드에서 직접 고칠 때도 그렇게 적는다. new Date() 는 그런 형식을 전혀
 * 못 읽어서 캘린더 등록이 통째로 건너뛰어졌다.
 *
 * 연도가 없으면 회의 날짜를 기준으로 채운다. 회의에서 "8월 17일"이라고만 말했으면
 * 그 회의가 열린 해를 뜻하는 게 자연스럽고, 이미 지난 날짜면 이듬해로 본다.
 */

export interface ParsedDate {
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM — 시각이 적혀 있을 때만 */
  time?: string;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** 두 자리 연도를 2000년대로 편다 (26 → 2026). */
function expandYear(y: number): number {
  return y < 100 ? 2000 + y : y;
}

function valid(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** 문자열 어딘가에 있는 시각을 찾는다. '오후 2시', '14:00', '2시 30분' 등. */
function findTime(s: string): string | undefined {
  const hm = s.match(/(\d{1,2})\s*:\s*(\d{2})/);
  if (hm) {
    const h = +hm[1], m = +hm[2];
    if (h <= 23 && m <= 59) return `${pad(h)}:${pad(m)}`;
  }

  const ko = s.match(/(오전|오후)?\s*(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분)?/);
  if (ko) {
    let h = +ko[2];
    const m = ko[3] ? +ko[3] : 0;
    if (h > 23 || m > 59) return undefined;
    if (ko[1] === '오후' && h < 12) h += 12;
    if (ko[1] === '오전' && h === 12) h = 0;
    return `${pad(h)}:${pad(m)}`;
  }

  return undefined;
}

/**
 * 날짜를 뽑는다. 못 찾으면 null.
 * @param input  "2026-08-17", "26년 8월 17일", "8월 17일에 다시 만나기로" 등
 * @param reference 연도가 없을 때 기준이 되는 날짜 (보통 회의한 날)
 */
export function parseKoreanDate(input?: string, reference: Date = new Date()): ParsedDate | null {
  if (!input) return null;
  const s = input.trim();
  if (!s) return null;

  const time = findTime(s);

  // 1) 2026-08-17 / 2026.08.17 / 2026/8/17
  const iso = s.match(/(\d{4})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{1,2})/);
  if (iso) {
    const [, y, m, d] = iso.map(Number);
    if (valid(y, m, d)) return { date: `${y}-${pad(m)}-${pad(d)}`, time };
  }

  // 2) 2026년 8월 17일 / 26년 8월 17일
  const koFull = s.match(/(\d{2,4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (koFull) {
    const y = expandYear(+koFull[1]);
    const m = +koFull[2], d = +koFull[3];
    if (valid(y, m, d)) return { date: `${y}-${pad(m)}-${pad(d)}`, time };
  }

  // 3) 8월 17일 — 연도가 없으면 기준 날짜의 해로 채우고, 이미 지났으면 이듬해로 본다
  const koShort = s.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (koShort) {
    const m = +koShort[1], d = +koShort[2];
    let y = reference.getUTCFullYear();
    if (!valid(y, m, d)) return null;

    const candidate = Date.UTC(y, m - 1, d);
    // 기준일보다 한 달 이상 과거면 내년 이야기로 본다 (회의 중 언급되는 일정은 대개 앞날)
    if (candidate < reference.getTime() - 31 * 86400000) y += 1;
    if (!valid(y, m, d)) return null;

    return { date: `${y}-${pad(m)}-${pad(d)}`, time };
  }

  return null;
}
