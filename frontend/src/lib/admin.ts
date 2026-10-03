import { api, ApiError } from './api';

/** GET админ-API: 403 превращаем в понятное «нет доступа». */
export async function adminGet<T>(path: string): Promise<T> {
  try {
    return await api.get<T>(`/admin${path}`);
  } catch (e) {
    if (e instanceof ApiError && e.status === 403) {
      throw new Error('Нет доступа. Раздел доступен только владельцу бота.');
    }
    throw e;
  }
}
