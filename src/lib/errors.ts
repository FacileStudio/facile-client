import { parseRetryAfter } from './retry-after.js';

/** The `error` object of tronc's envelope, every field the server sent, untyped. */
export type ErrorDetails = Readonly<Record<string, unknown>>;

/** The `code` of the `ApiError` thrown when the request got no answer at all. */
export const NETWORK_CODE = 'network';

const NO_DETAILS: ErrorDetails = Object.freeze({});

/**
 * A non-2xx answer, read from the tronc envelope `{"error":{"code","message"}}`.
 * `retryAfterSeconds` is the response's Retry-After header in seconds, or `null` without a valid one.
 * `details` is the envelope's whole `error` object, for example a 402's `key` and `limit`, and
 * empty when the body was not the envelope.
 */
export class ApiError extends Error {
	readonly status: number;
	readonly code: string;
	readonly upgradeUrl?: string;
	readonly retryAfterSeconds: number | null;
	readonly details: ErrorDetails;

	/** Builds the error for one failed response. `code` is empty when the body carried none. */
	constructor(
		status: number,
		code: string,
		message: string,
		upgradeUrl?: string,
		retryAfterSeconds: number | null = null,
		details: ErrorDetails = NO_DETAILS
	) {
		super(message);
		this.name = 'ApiError';
		this.status = status;
		this.code = code;
		this.upgradeUrl = upgradeUrl;
		this.retryAfterSeconds = retryAfterSeconds;
		this.details = details;
	}
}

/** Reports whether `error` is the API refusing the session (401), as opposed to any other failure. */
export function isUnauthorized(error: unknown): boolean {
	return error instanceof ApiError && error.status === 401;
}

function text(value: unknown): string {
	return typeof value === 'string' ? value : '';
}

function parseEnvelope(body: string): ErrorDetails {
	try {
		const error: unknown = (JSON.parse(body) as { error?: unknown } | null)?.error;
		return error && typeof error === 'object' && !Array.isArray(error) ? Object.freeze({ ...error }) : NO_DETAILS;
	} catch {
		return NO_DETAILS;
	}
}

/** Builds an `ApiError` from a status, a raw body and a Retry-After header value, as `toApiError` does. */
export function apiErrorFrom(status: number, body: string, retryAfter: string | null = null): ApiError {
	const details = parseEnvelope(body);
	const message = text(details.message) || `Request failed with status ${status}`;
	const upgradeUrl = text(details.upgrade_url) || undefined;
	return new ApiError(status, text(details.code), message, upgradeUrl, parseRetryAfter(retryAfter), details);
}

/** Reads a failed response into an `ApiError`, keeping the envelope's `error` object as `details`. */
export async function toApiError(response: Response): Promise<ApiError> {
	const body = await response.text().catch(() => '');
	return apiErrorFrom(response.status, body, response.headers.get('Retry-After'));
}

/** The error for a request that never got an answer: status 0, code `network`. */
export function networkError(): ApiError {
	return new ApiError(0, NETWORK_CODE, 'Network error');
}

/** Resolves a 2xx body: `undefined` for a 204 or an empty body, the parsed JSON otherwise. */
export async function readBody<T>(response: Response): Promise<T> {
	if (response.status === 204) return undefined as T;
	const body = await response.text();
	if (!body) return undefined as T;
	try {
		return JSON.parse(body) as T;
	} catch {
		throw new ApiError(response.status, 'invalid_response', 'Unexpected response from server');
	}
}
