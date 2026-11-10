import { afterEach, describe, expect, test } from 'bun:test';
import { createApi } from '../src/lib/fetch';
import { parseRetryAfter } from '../src/lib/retry-after';

const realFetch = globalThis.fetch;
const NOW = Date.parse('2026-11-10T12:00:00Z');

afterEach(() => {
	globalThis.fetch = realFetch;
});

describe('parseRetryAfter', () => {
	test('takes a non-negative integer as seconds', () => {
		expect(parseRetryAfter('120', NOW)).toBe(120);
		expect(parseRetryAfter(' 0 ', NOW)).toBe(0);
	});

	test('turns an HTTP date into seconds from now', () => {
		expect(parseRetryAfter('Tue, 10 Nov 2026 12:01:30 GMT', NOW)).toBe(90);
		expect(parseRetryAfter('Tuesday, 10-Nov-26 12:00:05 GMT', NOW)).toBe(5);
	});

	test('floors a past date at 0', () => {
		expect(parseRetryAfter('Tue, 10 Nov 2026 11:00:00 GMT', NOW)).toBe(0);
	});

	test('answers null for anything else', () => {
		for (const value of [null, '', '-5', '1.5', '+3', 'soon', '12abc', 'Nope, 99 Foo 2026']) {
			expect(parseRetryAfter(value, NOW)).toBeNull();
		}
	});
});

describe('ApiError.retryAfterSeconds', () => {
	function answer(headers: Record<string, string>): void {
		globalThis.fetch = (async () =>
			new Response('{"error":{"code":"rate_limited","message":"Slow down"}}', { status: 429, headers })) as unknown as typeof fetch;
	}

	test('carries the header a 429 sent', async () => {
		answer({ 'Retry-After': '30' });
		await expect(createApi()('/x')).rejects.toMatchObject({ status: 429, retryAfterSeconds: 30 });
	});

	test('carries an HTTP date as seconds from now', async () => {
		answer({ 'Retry-After': new Date(Date.now() + 60_000).toUTCString() });
		const error = (await createApi()('/x').catch((caught: unknown) => caught)) as { retryAfterSeconds: number };
		expect(error.retryAfterSeconds).toBeGreaterThanOrEqual(59);
		expect(error.retryAfterSeconds).toBeLessThanOrEqual(60);
	});

	test('is null without the header', async () => {
		answer({});
		await expect(createApi()('/x')).rejects.toMatchObject({ retryAfterSeconds: null });
	});
});
