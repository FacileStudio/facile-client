import { afterEach, describe, expect, mock, test } from 'bun:test';
import { createApi } from '../src/lib/fetch';
import { ApiError, checkOrigin, createNativeApi } from '../src/lib/native';

type Seen = { url: string; credentials?: string; headers: string[][] };

const realFetch = globalThis.fetch;

function stub(response: () => Response): Seen[] {
	const seen: Seen[] = [];
	globalThis.fetch = mock(async (url: string | URL | Request, init: RequestInit = {}) => {
		seen.push({ url: String(url), credentials: init.credentials, headers: [...new Headers(init.headers).entries()] });
		return response();
	}) as unknown as typeof fetch;
	return seen;
}

afterEach(() => {
	globalThis.fetch = realFetch;
});

const ORIGIN = 'https://courrier.facile.studio';

describe('createNativeApi', () => {
	test('sends the bearer token, no cookie and no CSRF header, where createApi does the opposite', async () => {
		const seen = stub(() => new Response('{}', { status: 200 }));
		const post = { method: 'POST', body: '{}' };
		await createApi()('/drafts', post);
		await createNativeApi({ origin: ORIGIN, token: async () => 'secret' })('/drafts', post);
		expect(seen).toEqual([
			{
				url: '/api/drafts',
				credentials: 'same-origin',
				headers: [
					['content-type', 'application/json'],
					['x-facile-csrf', '1']
				]
			},
			{
				url: 'https://courrier.facile.studio/api/drafts',
				credentials: 'omit',
				headers: [
					['authorization', 'Bearer secret'],
					['content-type', 'application/json']
				]
			}
		]);
	});

	test('reads the token on every request, sends none when it is null, and keeps an explicit one', async () => {
		const seen = stub(() => new Response('{}', { status: 200 }));
		const tokens = ['first', null];
		const token = mock(async () => tokens.shift() ?? null);
		const api = createNativeApi({ origin: `${ORIGIN}/`, token });
		await api('/me');
		await api('/me');
		await api('/me', { headers: { Authorization: 'Bearer fresh', 'X-Facile-CSRF': '1' }, method: 'DELETE' });
		expect(token).toHaveBeenCalledTimes(2);
		expect(seen.map((call) => call.headers)).toEqual([[['authorization', 'Bearer first']], [], [['authorization', 'Bearer fresh']]]);
	});

	test('parses errors like createApi and waits for onUnauthorized on 401', async () => {
		const order: string[] = [];
		const onUnauthorized = mock(async () => {
			await Promise.resolve();
			order.push('cleared');
		});
		const api = createNativeApi({ origin: ORIGIN, token: async () => 't', onUnauthorized });
		stub(() => new Response('{"error":{"code":"unauthenticated","message":"no session"}}\n', { status: 401 }));
		const error = await api('/me').catch((caught: unknown) => {
			order.push('thrown');
			return caught;
		});
		expect(error).toBeInstanceOf(ApiError);
		expect(error).toMatchObject({ status: 401, code: 'unauthenticated', details: { code: 'unauthenticated' } });
		expect(order).toEqual(['cleared', 'thrown']);
		await api('/me', {}, { quiet: true }).catch(() => null);
		expect(onUnauthorized).toHaveBeenCalledTimes(1);
		stub(() => new Response(null, { status: 204 }));
		expect(await api('/x', { method: 'DELETE' })).toBeUndefined();
	});
});

describe('the https rule', () => {
	test('accepts https anywhere and http only on localhost', () => {
		expect(checkOrigin('https://sablier.facile.studio')).toBe('https://sablier.facile.studio');
		expect(checkOrigin('https://sablier.facile.studio:8443/')).toBe('https://sablier.facile.studio:8443');
		expect(checkOrigin('http://localhost:4000')).toBe('http://localhost:4000');
		expect(checkOrigin('http://127.0.0.1:4000')).toBe('http://127.0.0.1:4000');
		expect(checkOrigin('http://[::1]:4000')).toBe('http://[::1]:4000');
	});

	test('refuses http elsewhere, a path, credentials, a relative base and garbage', () => {
		for (const origin of [
			'http://sablier.facile.studio',
			'http://localhost.evil.example',
			'https://sablier.facile.studio/api',
			'https://user:pass@sablier.facile.studio',
			'/api',
			'',
			'ftp://localhost',
			'not a url'
		]) {
			expect(() => createNativeApi({ origin, token: async () => null })).toThrow();
		}
	});

	test('the root entry still refuses an absolute base and never reads a token', async () => {
		expect(() => createApi({ base: 'https://courrier.facile.studio/api' })).toThrow();
		const seen = stub(() => new Response('{}', { status: 200 }));
		await createApi({ token: async () => 'leak' } as Parameters<typeof createApi>[0])('/x', { method: 'POST' });
		expect(seen[0].headers.some(([name]) => name === 'authorization')).toBe(false);
		expect(seen[0].credentials).toBe('same-origin');
	});

	test('the root entry does not export the native kernel', async () => {
		mock.module('$app/environment', () => ({ browser: true }));
		mock.module('$app/navigation', () => ({ goto: async () => {} }));
		const root: Record<string, unknown> = await import('../src/lib/index');
		expect(Object.keys(root)).not.toContain('createNativeApi');
		expect(Object.keys(root)).not.toContain('checkOrigin');
	});
});
