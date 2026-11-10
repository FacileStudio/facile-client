import { afterEach, describe, expect, mock, test } from 'bun:test';
import { ApiError, CSRF_HEADER, createApi } from '../src/lib/fetch';

type Seen = { url: string; init: RequestInit };

const realFetch = globalThis.fetch;

function stub(response: () => Response): Seen[] {
	const seen: Seen[] = [];
	globalThis.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
		seen.push({ url: String(url), init: init ?? {} });
		return response();
	}) as unknown as typeof fetch;
	return seen;
}

function json(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

afterEach(() => {
	globalThis.fetch = realFetch;
});

describe('createApi', () => {
	test('stays relative to /api and same-origin', async () => {
		const seen = stub(() => json(200, { ok: true }));
		expect(await createApi()<{ ok: boolean }>('/monitors')).toEqual({ ok: true });
		expect(seen[0].url).toBe('/api/monitors');
		expect(seen[0].init.credentials).toBe('same-origin');
	});

	test('refuses a base that is not a same-origin path', () => {
		expect(() => createApi({ base: 'https://evil.example/api' })).toThrow();
		expect(() => createApi({ base: '//evil.example/api' })).toThrow();
	});

	test('sends the CSRF header on mutations only', async () => {
		const seen = stub(() => json(200, {}));
		const api = createApi();
		for (const method of ['GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'PATCH', 'DELETE', 'post']) {
			await api('/x', { method });
		}
		await api('/x');
		const sent = seen.map((call) => new Headers(call.init.headers).get(CSRF_HEADER));
		expect(sent).toEqual([null, null, null, '1', '1', '1', '1', '1', null]);
	});

	test('marks a string body as JSON and leaves FormData alone', async () => {
		const seen = stub(() => json(200, {}));
		const api = createApi();
		await api('/x', { method: 'POST', body: '{}' });
		await api('/x', { method: 'POST', body: new FormData() });
		expect(new Headers(seen[0].init.headers).get('Content-Type')).toBe('application/json');
		expect(new Headers(seen[1].init.headers).get('Content-Type')).toBeNull();
	});

	test('parses the tronc envelope into ApiError', async () => {
		stub(() => json(402, { error: { code: 'plan_limit', message: 'Upgrade', upgrade_url: 'https://x/up' } }));
		const error = await createApi()('/x').catch((caught: unknown) => caught);
		expect(error).toBeInstanceOf(ApiError);
		expect(error).toMatchObject({ status: 402, code: 'plan_limit', message: 'Upgrade', upgradeUrl: 'https://x/up' });
	});

	test('falls back to the status when the body is not the envelope', async () => {
		stub(() => new Response('<!doctype html>', { status: 500 }));
		const error = await createApi()('/x').catch((caught: unknown) => caught);
		expect(error).toMatchObject({ status: 500, code: '', message: 'Request failed with status 500' });
	});

	test('calls onUnauthorized on 401, never on 403', async () => {
		const onUnauthorized = mock(() => {});
		const api = createApi({ onUnauthorized });
		stub(() => json(403, { error: { code: 'forbidden', message: 'missing X-Facile-CSRF header' } }));
		await expect(api('/x', { method: 'POST' })).rejects.toMatchObject({ status: 403 });
		expect(onUnauthorized).toHaveBeenCalledTimes(0);
		stub(() => json(401, { error: { code: 'unauthorized', message: 'no session' } }));
		await expect(api('/x')).rejects.toMatchObject({ status: 401, code: 'unauthorized' });
		expect(onUnauthorized).toHaveBeenCalledTimes(1);
		await expect(api('/x', {}, { quiet: true })).rejects.toMatchObject({ status: 401 });
		expect(onUnauthorized).toHaveBeenCalledTimes(1);
	});

	test('returns undefined for 204 and for an empty body', async () => {
		stub(() => new Response(null, { status: 204 }));
		expect(await createApi()('/x', { method: 'DELETE' })).toBeUndefined();
		stub(() => new Response('', { status: 200 }));
		expect(await createApi()('/x')).toBeUndefined();
	});

	test('rejects a 2xx body that is not JSON', async () => {
		stub(() => new Response('<!doctype html>', { status: 200 }));
		await expect(createApi()('/x')).rejects.toMatchObject({ code: 'invalid_response' });
	});
});
