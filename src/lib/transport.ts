import { networkError } from './errors.js';

/**
 * Runs one fetch and turns a network failure (the browser's `TypeError`) into an `ApiError` with
 * status 0 and code `network`. An abort is the caller's own doing and passes through unchanged.
 */
export async function send(url: string, init: RequestInit): Promise<Response> {
	try {
		return await fetch(url, init);
	} catch (error) {
		if (error instanceof TypeError) throw networkError();
		throw error;
	}
}
