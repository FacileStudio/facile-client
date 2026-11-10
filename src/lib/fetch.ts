import { parseRetryAfter } from './retry-after.js';

/** The header porte requires on a cookie-authenticated mutation. porte checks presence, not value. */
export const CSRF_HEADER = 'X-Facile-CSRF';

const SAFE_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * A non-2xx answer, read from the tronc envelope `{"error":{"code","message"}}`.
 * `retryAfterSeconds` is the response's Retry-After header in seconds, or `null` without a valid one.
 */
export class ApiError extends Error {
	readonly status: number;
	readonly code: string;
	readonly upgradeUrl?: string;
	readonly retryAfterSeconds: number | null;

	/** Builds the error for one failed response. `code` is empty when the body carried none. */
	constructor(
		status: number,
		code: string,
		message: string,
		upgradeUrl?: string,
		retryAfterSeconds: number | null = null
	) {
		super(message);
		this.name = 'ApiError';
		this.status = status;
		this.code = code;
		this.upgradeUrl = upgradeUrl;
		this.retryAfterSeconds = retryAfterSeconds;
	}
}

/** How `createApi` reaches the API and what it does when the session is refused. */
export type ApiOptions = {
	base?: string;
	onUnauthorized?: (response: Response) => void;
};

/** Per-call switches. `quiet` keeps a 401 from reaching `onUnauthorized`, for a session probe. */
export type CallOptions = {
	quiet?: boolean;
};

/** One call to the API: resolves to the parsed body, or `undefined` for an empty one. */
export type Api = <T>(path: string, init?: RequestInit, options?: CallOptions) => Promise<T>;

type Envelope = { code?: unknown; message?: unknown; upgrade_url?: unknown };

/** Reports whether `error` is the API refusing the session (401), as opposed to any other failure. */
export function isUnauthorized(error: unknown): boolean {
	return error instanceof ApiError && error.status === 401;
}

function text(value: unknown): string {
	return typeof value === 'string' ? value : '';
}

function parseEnvelope(body: string): Envelope {
	try {
		const error: unknown = (JSON.parse(body) as { error?: unknown } | null)?.error;
		return error && typeof error === 'object' ? (error as Envelope) : {};
	} catch {
		return {};
	}
}

async function toApiError(response: Response): Promise<ApiError> {
	const envelope = parseEnvelope(await response.text().catch(() => ''));
	const message = text(envelope.message) || `Request failed with status ${response.status}`;
	const upgradeUrl = text(envelope.upgrade_url) || undefined;
	const retryAfter = parseRetryAfter(response.headers.get('Retry-After'));
	return new ApiError(response.status, text(envelope.code), message, upgradeUrl, retryAfter);
}

async function readBody<T>(response: Response): Promise<T> {
	if (response.status === 204) return undefined as T;
	const body = await response.text();
	if (!body) return undefined as T;
	try {
		return JSON.parse(body) as T;
	} catch {
		throw new ApiError(response.status, 'invalid_response', 'Unexpected response from server');
	}
}

function buildHeaders(init: RequestInit): Headers {
	const headers = new Headers(init.headers);
	if (typeof init.body === 'string' && !headers.has('Content-Type')) {
		headers.set('Content-Type', 'application/json');
	}
	if (!SAFE_METHODS.has((init.method ?? 'GET').toUpperCase())) {
		headers.set(CSRF_HEADER, '1');
	}
	return headers;
}

function checkBase(base: string): string {
	if (!base.startsWith('/') || base.startsWith('//')) {
		throw new Error(`@facile/client: base must be a same-origin path such as /api, got ${base}`);
	}
	return base.replace(/\/$/, '');
}

/**
 * Returns the suite's fetch kernel. Every call is relative to `base`, sends the cookie
 * same-origin, adds the CSRF header on every method but GET, HEAD and OPTIONS, and throws
 * an `ApiError` on a non-2xx answer. Only a 401 calls `onUnauthorized`: porte keeps 403 for a
 * missing CSRF header and for app permission checks, which signing in again does not fix.
 */
export function createApi(options: ApiOptions = {}): Api {
	const base = checkBase(options.base ?? '/api');
	return async function api<T>(path: string, init: RequestInit = {}, call: CallOptions = {}): Promise<T> {
		const response = await fetch(`${base}${path}`, {
			...init,
			headers: buildHeaders(init),
			credentials: 'same-origin'
		});
		if (response.status === 401 && !call.quiet) options.onUnauthorized?.(response);
		if (!response.ok) throw await toApiError(response);
		return readBody<T>(response);
	};
}
