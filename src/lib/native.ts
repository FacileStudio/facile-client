import { ApiError, isUnauthorized } from './errors.js';
import { CSRF_HEADER, buildHeaders, checkBase, settle, type Api, type CallOptions } from './fetch.js';

export { ApiError, isUnauthorized };
export type { Api, CallOptions };
export type { ErrorDetails } from './errors.js';

/**
 * How a native shell (Tauri, Capacitor) reaches the API. `origin` is the API's absolute origin,
 * `token` reads the bearer token from the platform's secure storage on every request, and
 * `onUnauthorized` runs on a 401, for example to forget the token. It may return a promise,
 * which the call waits for before it throws.
 */
export type NativeApiOptions = {
	origin: string;
	base?: string;
	token: () => Promise<string | null>;
	onUnauthorized?: (response: Response) => void | Promise<void>;
};

const LOOPBACK: ReadonlySet<string> = new Set(['localhost', '127.0.0.1', '[::1]']);

function parse(origin: string): URL | null {
	try {
		return new URL(origin);
	} catch {
		return null;
	}
}

/** Returns `origin` when it is a bare https origin, or http on localhost; throws otherwise. */
export function checkOrigin(origin: string): string {
	const url = parse(origin);
	const secure = url?.protocol === 'https:' || (url?.protocol === 'http:' && LOOPBACK.has(url.hostname));
	if (!url || !secure || url.origin !== origin.replace(/\/$/, '')) {
		throw new Error(`@facile/client/native: origin must be a bare https origin (http only on localhost), got ${origin}`);
	}
	return url.origin;
}

async function nativeHeaders(init: RequestInit, token: () => Promise<string | null>): Promise<Headers> {
	const headers = buildHeaders(init);
	headers.delete(CSRF_HEADER);
	if (headers.has('Authorization')) return headers;
	const bearer = await token();
	if (bearer) headers.set('Authorization', `Bearer ${bearer}`);
	return headers;
}

/**
 * Returns the fetch kernel for a native shell. Every call goes to `origin` + `base` (default
 * `/api`), sends `Authorization: Bearer <token>` when `token` resolves to one and the caller set
 * no Authorization header, never sends cookies and never sends the CSRF header. Errors, 204 and
 * `quiet` behave exactly as in `createApi`. For browsers, use `createApi` from `@facile/client`.
 */
export function createNativeApi(options: NativeApiOptions): Api {
	const root = `${checkOrigin(options.origin)}${checkBase(options.base ?? '/api')}`;
	return async function api<T>(path: string, init: RequestInit = {}, call: CallOptions = {}): Promise<T> {
		const response = await fetch(`${root}${path}`, {
			...init,
			headers: await nativeHeaders(init, options.token),
			credentials: 'omit'
		});
		return settle<T>(response, call, options.onUnauthorized);
	};
}
