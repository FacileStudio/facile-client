import { ApiError, NETWORK_CODE, apiErrorFrom } from './errors.js';
import { CSRF_HEADER } from './fetch.js';

/** How `uploadWithProgress` sends one body. `headers` is where a native shell puts its bearer token. */
export type UploadOptions = {
	method?: string;
	headers?: HeadersInit;
	csrf?: boolean;
	onProgress?: (loaded: number, total: number) => void;
	signal?: AbortSignal;
};

function settleUpload<T>(xhr: XMLHttpRequest, resolve: (value: T) => void, reject: (error: unknown) => void): void {
	if (xhr.status < 200 || xhr.status >= 300) {
		reject(apiErrorFrom(xhr.status, xhr.responseText, xhr.getResponseHeader('Retry-After')));
		return;
	}
	try {
		resolve((xhr.responseText ? JSON.parse(xhr.responseText) : undefined) as T);
	} catch {
		reject(new ApiError(xhr.status, 'invalid_response', 'Unexpected response from server'));
	}
}

/**
 * Sends `body` to `url` with XMLHttpRequest, which `fetch` cannot do while reporting upload
 * progress. Same-origin cookie, the CSRF header unless `csrf` is false, the tronc envelope as an
 * `ApiError`, and a network failure as status 0, code `network`. An abort rejects with an
 * `AbortError` `DOMException`. A 401 only rejects: the caller decides what it means.
 */
export function uploadWithProgress<T>(url: string, body: XMLHttpRequestBodyInit, options: UploadOptions = {}): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const xhr = new XMLHttpRequest();
		xhr.open(options.method ?? 'POST', url);
		new Headers(options.headers).forEach((value, key) => xhr.setRequestHeader(key, value));
		if (options.csrf !== false) xhr.setRequestHeader(CSRF_HEADER, '1');
		xhr.upload.onprogress = (event) => {
			if (event.lengthComputable) options.onProgress?.(event.loaded, event.total);
		};
		xhr.onload = () => settleUpload(xhr, resolve, reject);
		xhr.onerror = () => reject(new ApiError(0, NETWORK_CODE, 'Network error'));
		xhr.onabort = () => reject(new DOMException('Aborted', 'AbortError'));
		options.signal?.addEventListener('abort', () => xhr.abort(), { once: true });
		xhr.send(body);
	});
}
