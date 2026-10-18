import { http } from './http';
import type { Balance, LoginResponse, Me } from './types';

/** Bad credentials come back as 401; the login form shows them inline instead of a toast. */
export async function login(email: string, password: string): Promise<LoginResponse> {
  const { data } = await http.post<LoginResponse>(
    '/auth/login',
    { email, password },
    { skipAuthRedirect: true, skipErrorToast: true },
  );
  return data;
}

/** Also used for background re-checks, so failures don't toast; callers decide what to show. */
export async function getMe(): Promise<Me> {
  const { data } = await http.get<Me>('/me', { skipErrorToast: true });
  return data;
}

export async function getBalance(year: number): Promise<Balance> {
  const { data } = await http.get<Balance>('/me/balance', { params: { year } });
  return data;
}
