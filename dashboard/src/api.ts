export const API_BASE = '';

export async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const response = await fetch(url, {
    ...options,
    credentials: 'include',
  });

  if (response.status === 401) {
    throw new Error('Unauthorized');
  }

  return response;
}
