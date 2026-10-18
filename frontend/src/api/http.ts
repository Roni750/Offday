import axios from 'axios';
import { type ApiError, toApiError } from './errors';

declare module 'axios' {
  interface AxiosRequestConfig {
    /** Don't raise the global error toast; the caller renders the error itself. */
    skipErrorToast?: boolean;
    /** Don't treat a 401 as an expired session (used by the login call). */
    skipAuthRedirect?: boolean;
  }
}

export const API_URL: string = import.meta.env.VITE_API_URL || 'http://localhost:8888';

/** The single Axios instance used by every endpoint module. */
export const http = axios.create({
  baseURL: API_URL,
  timeout: 20_000,
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
});

export interface HttpHooks {
  getToken: () => string | null;
  /** A protected call returned 401: the session is gone. */
  onUnauthorized: (error: ApiError) => void;
  /** Any other failed call that didn't opt out of the global toast. */
  onError: (error: ApiError) => void;
}

/**
 * Wires auth and error handling into the client. Called once from `main.ts`,
 * so this module never imports the stores or the router (no import cycles).
 * Every rejected call rejects with an {@link ApiError}.
 */
export function installInterceptors(hooks: HttpHooks): void {
  http.interceptors.request.use((config) => {
    const token = hooks.getToken();
    if (token) config.headers.set('Authorization', `Bearer ${token}`);
    return config;
  });

  http.interceptors.response.use(
    (response) => response,
    (error: unknown) => {
      const apiError = toApiError(error);
      const config = axios.isAxiosError(error) ? error.config : undefined;
      if (apiError.status === 401 && !config?.skipAuthRedirect) {
        hooks.onUnauthorized(apiError);
      } else if (!config?.skipErrorToast) {
        hooks.onError(apiError);
      }
      return Promise.reject(apiError);
    },
  );
}
