/**
 * ActionItem_run 구글 시트와 주고받는다.
 *
 * 읽기가 필요한 이유: 주간보고는 매주 같은 일이 반복해서 실린다. 41주차에 있던
 * "AP 이전 통합테스트"가 42주차에도 나온다. 기존 행을 모르면 같은 항목이 매주
 * 쌓여 관리 대장으로 못 쓰게 된다.
 *
 * 시트 쪽 설정은 scripts/README-actionitem-sheet.md 참고.
 */

const SHEET_URL = process.env.ACTIONITEM_SHEET_URL;
const SHEET_TOKEN = process.env.ACTIONITEM_SHEET_TOKEN;

/** 시트 한 행. 열 이름을 그대로 키로 쓴다. */
export type ActionItemRow = Record<string, string>;

export interface SheetSnapshot {
  headers: string[];
  rows: ActionItemRow[];
  /** 시트에서 실제로 쓰이고 있는 분류 값들 — 목록의 씨앗이 된다 */
  categories: string[];
  teams: string[];
  statuses: string[];
}

export function isSheetConfigured(): boolean {
  return Boolean(SHEET_URL && SHEET_TOKEN);
}

function requireConfig(): string {
  if (!SHEET_URL || !SHEET_TOKEN) {
    throw new Error(
      'ACTIONITEM_SHEET_URL / ACTIONITEM_SHEET_TOKEN 이 .env 에 없습니다. ' +
      'scripts/README-actionitem-sheet.md 를 따라 설정하세요.'
    );
  }
  return SHEET_URL;
}

/** 기존 행과 분류 값을 가져온다. */
export async function fetchSheet(limit?: number): Promise<SheetSnapshot> {
  const url = new URL(requireConfig());
  if (limit) url.searchParams.set('limit', String(limit));

  // Apps Script 는 302 로 실제 콘텐츠를 내려주므로 리다이렉트를 따라가야 한다
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`시트 조회 실패: HTTP ${res.status}`);

  const data = await res.json().catch(() => {
    throw new Error('시트가 JSON 을 돌려주지 않았습니다. 웹 앱 배포 권한이 "모든 사용자"인지 확인하세요.');
  });

  if (!data.ok) throw new Error(`시트 조회 실패: ${data.error}`);

  return {
    headers: data.headers ?? [],
    rows: data.rows ?? [],
    categories: data.categories ?? [],
    teams: data.teams ?? [],
    statuses: data.statuses ?? [],
  };
}

/** 새 행을 덧붙인다. */
export async function appendRows(items: ActionItemRow[]): Promise<number> {
  if (items.length === 0) return 0;

  const res = await fetch(requireConfig(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: SHEET_TOKEN, items }),
    redirect: 'follow',
  });

  if (!res.ok) throw new Error(`시트 추가 실패: HTTP ${res.status}`);

  const data = await res.json().catch(() => {
    throw new Error('시트가 JSON 을 돌려주지 않았습니다.');
  });

  if (!data.ok) throw new Error(`시트 추가 실패: ${data.error}`);
  return data.added ?? items.length;
}
