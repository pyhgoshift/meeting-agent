export const API_BASE = '';

/**
 * 2xx가 아니면 전부 예외로 올리고, 서버가 보낸 사유를 메시지에 담는다.
 * 예전엔 401만 걸러내고 500·503을 성공으로 통과시켜서, 호출부가 { error: ... }를
 * 데이터로 착각해 상태에 넣고 다음 렌더에서 화면 전체가 죽었다.
 *
 * (이름에 Auth가 남아있지만 대시보드 자체 인증은 없다. 접근 통제는 Cloudflare
 *  Access가 엣지에서 처리한다.)
 */
export async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const response = await fetch(url, {
    ...options,
    credentials: 'include',
  });

  if (!response.ok) {
    let detail = '';
    try {
      const body = await response.clone().json();
      detail = body?.error ?? '';
    } catch {
      // JSON이 아니면 사유 없이 상태 코드만 알린다
    }
    throw new Error(detail ? `${response.status} — ${detail}` : `서버 오류 (${response.status})`);
  }

  return response;
}
