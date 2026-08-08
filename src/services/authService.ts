import { httpClient, setApiAuthToken, setApiSessionKey } from '../api/httpClient';

export interface AuthenticatedProfile { id: string; firstName: string; lastName?: string; username?: string; photoUrl?: string; }
export async function authenticateTelegram(initData: string): Promise<AuthenticatedProfile> {
  const response = await httpClient.post<{ token: string; sessionKey: string; user: AuthenticatedProfile }>('/api/auth/telegram', { initData });
  setApiAuthToken(response.data.token);
  setApiSessionKey(response.data.sessionKey);
  return response.data.user;
}
