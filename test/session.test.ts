import { describe, expect, test } from 'bun:test';
import { ApiError, type Api } from '../src/lib/fetch';
import { createSession } from '../src/lib/session.svelte';

type User = { email: string };

function fakeApi(answer: (path: string) => unknown): { api: Api; calls: string[] } {
	const calls: string[] = [];
	const api = (async (path: string, init?: RequestInit) => {
		calls.push(`${init?.method ?? 'GET'} ${path}`);
		const result = answer(path);
		if (result instanceof Error) throw result;
		return result;
	}) as Api;
	return { api, calls };
}

describe('createSession', () => {
	test('refresh reads body.user from /auth/me and shares one request', async () => {
		const { api, calls } = fakeApi(() => ({ user: { email: 'a@b.c' } }));
		const session = createSession<User>(api);
		expect(session.loading).toBe(true);
		await Promise.all([session.refresh(), session.refresh()]);
		expect(session.user).toEqual({ email: 'a@b.c' });
		expect(session.loading).toBe(false);
		expect(calls).toEqual(['GET /auth/me']);
	});

	test('a 401 means signed out, any other failure rethrows and keeps the user', async () => {
		let answer: unknown = { user: { email: 'a@b.c' } };
		const session = createSession<User>(fakeApi(() => answer).api);
		await session.refresh();
		answer = new ApiError(500, 'internal', 'boom');
		await expect(session.refresh()).rejects.toMatchObject({ status: 500 });
		expect(session.user).toEqual({ email: 'a@b.c' });
		answer = new ApiError(401, 'unauthorized', 'no session');
		expect(await session.refresh()).toBeNull();
		expect(session.user).toBeNull();
	});

	test('logout posts and clears the user', async () => {
		const { api, calls } = fakeApi((path) => (path === '/auth/me' ? { email: 'a@b.c' } : undefined));
		const session = createSession<User>(api, { read: (body) => body as User });
		await session.refresh();
		expect(session.user).toEqual({ email: 'a@b.c' });
		await session.logout();
		expect(session.user).toBeNull();
		expect(calls).toEqual(['GET /auth/me', 'POST /auth/logout']);
	});
});
