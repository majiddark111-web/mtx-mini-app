import { httpClient, setApiSession } from '../api/httpClient';

export interface AuthenticatedProfile { id: string; firstName: string; lastName?: string; username?: string; photoUrl?: string; }
export async function authenticateTelegram(initData: string): Promise<AuthenticatedProfile> {
  const response = await httpClient.post<{ token: string; sessionKey: string; user: AuthenticatedProfile }>('/api/auth/telegram', { initData });
  setApiSession(response.data);
  return response.data.user;
}
