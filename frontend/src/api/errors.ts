import { isAxiosError } from 'axios';
import type { ApiErrorBody, ApiErrorDetails } from './types';

/**
 * Normalized error thrown by every API function. `code` is one of the contract
 * codes, or `NETWORK` / `UNKNOWN` for failures that never produced an error body.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: ApiErrorDetails;

  constructor(status: number, code: string, message: string, details: ApiErrorDetails = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  get fieldErrors(): Record<string, string> {
    return this.details.fields ?? {};
  }
}

function isErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== 'object' || value === null || !('error' in value)) return false;
  const error = (value as { error: unknown }).error;
  return typeof error === 'object' && error !== null && 'code' in error && 'message' in error;
}

/** Maps any thrown value (Axios or otherwise) onto an {@link ApiError}. */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (isAxiosError(error)) {
    if (!error.response) {
      return new ApiError(0, 'NETWORK', "Can't reach the Offday server. Check your connection and try again.");
    }
    const { status, data } = error.response;
    if (isErrorBody(data)) {
      return new ApiError(status, data.error.code, data.error.message, data.error.details ?? {});
    }
    return new ApiError(status, 'UNKNOWN', `Unexpected response from the server (HTTP ${status}).`);
  }
  return new ApiError(0, 'UNKNOWN', error instanceof Error ? error.message : 'Something went wrong.');
}

const TITLES: Record<string, string> = {
  VALIDATION_ERROR: 'Check the highlighted fields',
  UNAUTHENTICATED: 'Please sign in again',
  FORBIDDEN: "You don't have access to that",
  NOT_FOUND: 'Not found',
  OVERLAP: 'These dates overlap another request',
  INVALID_STATE: "That can't be changed anymore",
  INTERNAL: 'Something went wrong on our side',
  NETWORK: 'Connection problem',
};

export function errorTitle(error: ApiError): string {
  return TITLES[error.code] ?? 'Something went wrong';
}
