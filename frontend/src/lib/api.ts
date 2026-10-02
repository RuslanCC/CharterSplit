import { getInitDataRaw } from './telegram';

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || '';
const API_BASE = `${BASE_PATH}/api`;

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Человекочитаемый текст ошибки для показа в UI. */
export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const initData = getInitDataRaw();
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(initData ? { Authorization: `tma ${initData}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    // initData живёт ограниченное время (INIT_DATA_EXPIRES_IN на бэкенде).
    if (res.status === 401) {
      throw new ApiError(401, 'Сессия истекла — закройте и снова откройте приложение.');
    }
    let message = `HTTP ${res.status}`;
    try {
      const data = (await res.json()) as { message?: string | string[] };
      if (Array.isArray(data.message)) message = data.message.join(', ');
      else if (data.message) message = data.message;
    } catch {
      /* тело не JSON — оставляем HTTP-статус */
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};
