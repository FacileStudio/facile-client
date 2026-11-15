import { buildHeaders, check, checkBase, type ApiOptions, type CallOptions } from './fetch.js';
import { send } from './transport.js';
import { resolveUnauthorized } from './unauthorized.js';

/** One call that resolves to the response body as a `Blob`, with the kernel's errors and 401 policy. */
export type BlobApi = (path: string, init?: RequestInit, options?: CallOptions) => Promise<Blob>;

/**
 * Returns the download twin of `createApi`: same `base`, cookie, CSRF header, `ApiError` and 401
 * policy, but a 2xx body comes back as a `Blob` instead of JSON.
 */
export function createBlobApi(options: ApiOptions = {}): BlobApi {
	const base = checkBase(options.base ?? '/api');
	const onUnauthorized = resolveUnauthorized(options);
	return async function download(path, init = {}, call = {}) {
		const response = await send(`${base}${path}`, {
			...init,
			headers: buildHeaders(init),
			credentials: 'same-origin'
		});
		return (await check(response, call, onUnauthorized)).blob();
	};
}

/** Hands `blob` to the browser as a download named `filename`. */
export function saveBlob(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = filename;
	anchor.click();
	URL.revokeObjectURL(url);
}
