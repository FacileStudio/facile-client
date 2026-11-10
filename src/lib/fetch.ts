import { ApiError, isUnauthorized, readBody, toApiError } from './errors.js';

export { ApiError, isUnauthorized };
export type { ErrorDetails } from './errors.js';

/** The header porte requires on a cookie-authenticated mutation. porte checks presence, not value. */
export const CSRF_HEADER = 'X-Facile-CSRF';

const SAFE_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);

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

/** The request headers: `init`'s own, plus JSON for a string body and the CSRF header on mutations. */
export function buildHeaders(init: RequestInit): Headers {
	const headers = new Headers(init.headers);
	if (typeof init.body === 'string' && !headers.has('Content-Type')) {
		headers.set('Content-Type', 'application/json');
	}
	if (!SAFE_METHODS.has((init.method ?? 'GET').toUpperCase())) {
		headers.set(CSRF_HEADER, '1');
	}
	return headers;
}

/**
 * Turns one response into the call's result, the same way for every entry point: a 401 not
 * marked `quiet` reaches `onUnauthorized`, a non-2xx answer throws `ApiError`, and a 2xx body
 * is parsed.
 */
export async function settle<T>(
	response: Response,
	call: CallOptions,
	onUnauthorized?: (response: Response) => void | Promise<void>
): Promise<T> {
	if (response.status === 401 && !call.quiet) await onUnauthorized?.(response);
	if (!response.ok) throw await toApiError(response);
	return readBody<T>(response);
}

/** Returns `base` without its trailing slash, or throws when it is not a same-origin path. */
export function checkBase(base: string): string {
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
		return settle<T>(response, call, options.onUnauthorized);
	};
}
