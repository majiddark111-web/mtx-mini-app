import { httpClient, setApiAuthToken } from '../api/httpClient';

export interface AuthenticatedProfile { id: string; firstName: string; lastName?: string; username?: string; photoUrl?: string; }
export async function authenticateTelegram(initData: string): Promise<AuthenticatedProfile> {
  const response = await httpClient.post<{ token: string; user: AuthenticatedProfile }>('/api/auth/telegram', { initData });
  setApiAuthToken(response.data.token);
  return response.data.user;
}
