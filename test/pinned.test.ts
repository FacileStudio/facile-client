import { afterEach, describe, expect, mock, test } from 'bun:test';
import { createApi } from '../src/lib/fetch';

type Shape = { url: string; keys: string[]; method?: string; body?: unknown; credentials?: string; headers: string[][] };

const realFetch = globalThis.fetch;

function capture(): Shape[] {
	const seen: Shape[] = [];
	globalThis.fetch = mock(async (url: string | URL | Request, init: RequestInit = {}) => {
		seen.push({
			url: String(url),
			keys: Object.keys(init).sort(),
			method: init.method,
			body: init.body ?? undefined,
			credentials: init.credentials,
			headers: [...new Headers(init.headers).entries()]
		});
		return new Response('{}', { status: 200 });
	}) as unknown as typeof fetch;
	return seen;
}

afterEach(() => {
	globalThis.fetch = realFetch;
});

describe('v0.1 default request, pinned', () => {
	test('a GET and a JSON POST through createApi() are exactly what v0.1.1 sent', async () => {
		const seen = capture();
		const api = createApi();
		await api('/monitors');
		await api('/monitors', { method: 'POST', body: '{"name":"a"}' });
		expect(seen).toEqual([
			{ url: '/api/monitors', keys: ['credentials', 'headers'], credentials: 'same-origin', headers: [] },
			{
				url: '/api/monitors',
				keys: ['body', 'credentials', 'headers', 'method'],
				method: 'POST',
				body: '{"name":"a"}',
				credentials: 'same-origin',
				headers: [
					['content-type', 'application/json'],
					['x-facile-csrf', '1']
				]
			}
		]);
	});
});
