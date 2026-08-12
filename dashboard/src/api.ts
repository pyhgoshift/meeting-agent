export const API_BASE = '';

/**
 * 401만 걸러내던 예전 버전은 500·503을 "성공"으로 통과시켰다. 그러면 호출부가
 * { error: ... } 를 데이터로 착각해 상태에 넣고, 다음 렌더에서 화면 전체가 죽었다.
 * 이제 2xx가 아니면 전부 예외로 올리고, 서버가 보낸 사유를 메시지에 담는다.
 */
export async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const response = await fetch(url, {
    ...options,
    credentials: 'include',
  });

  if (response.status === 401) {
    throw new Error('Unauthorized');
  }

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
