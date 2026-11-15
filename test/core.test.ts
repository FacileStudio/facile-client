import { afterEach, describe, expect, mock, test } from 'bun:test';
import {
	ApiError,
	authConfig,
	createApi,
	createBlobApi,
	forgetLegacyTokens,
	probeSession,
	refusesOwnSession,
	spaceQuery,
	withSpace,
	OWN_SESSION_REFUSAL
} from '../src/lib/core';

async function failure(call: Promise<unknown>): Promise<ApiError> {
	try {
		await call;
	} catch (error) {
		return error as ApiError;
	}
	throw new Error('the call resolved');
}

const realFetch = globalThis.fetch;
const realWindow = globalThis.window;

function reply(status: number, body: unknown = {}): void {
	globalThis.fetch = mock(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
}

afterEach(() => {
	globalThis.fetch = realFetch;
	globalThis.window = realWindow;
});

describe('core entry', () => {
	test('imports with no $app module', () => {
		expect(typeof createApi).toBe('function');
	});

	test('a network failure is an ApiError with status 0 and code network', async () => {
		globalThis.fetch = mock(async () => {
			throw new TypeError('Failed to fetch');
		}) as unknown as typeof fetch;
		const error = await failure(createApi()('/x'));
		expect(error).toBeInstanceOf(ApiError);
		expect([error.status, error.code]).toEqual([0, 'network']);
	});

	test('an abort is not rewritten', async () => {
		globalThis.fetch = mock(async () => {
			throw new DOMException('Aborted', 'AbortError');
		}) as unknown as typeof fetch;
		const error = await failure(createApi()('/x'));
		expect(error.name).toBe('AbortError');
	});
});

describe('401 policy', () => {
	function fakeWindow(): string[] {
		const seen: string[] = [];
		globalThis.window = {
			location: { pathname: '/files', search: '?a=1', replace: (url: string) => seen.push(url) }
		} as unknown as Window & typeof globalThis;
		return seen;
	}

	test('login replaces the page with /login?next=', async () => {
		const seen = fakeWindow();
		reply(401, { error: { code: 'unauthenticated', message: 'no' } });
		await createApi({ unauthorized: 'login' })('/x').catch(() => null);
		expect(seen).toEqual(['/login?next=%2Ffiles%3Fa%3D1']);
	});

	test('sso replaces the page with the OIDC start path', async () => {
		const seen = fakeWindow();
		reply(401);
		await createApi({ unauthorized: 'sso' })('/x').catch(() => null);
		await createApi({ unauthorized: 'sso', ssoPath: '/auth/oidc' })('/x').catch(() => null);
		expect(seen).toEqual(['/api/auth/oidc', '/auth/oidc']);
	});

	test('a hook runs, onUnauthorized wins over the policy, quiet and the default do nothing', async () => {
		const seen = fakeWindow();
		const hook = mock(() => undefined);
		reply(401);
		await createApi({ unauthorized: hook })('/x').catch(() => null);
		await createApi({ unauthorized: 'sso', onUnauthorized: hook })('/x').catch(() => null);
		await createApi({ unauthorized: 'sso' })('/x', {}, { quiet: true }).catch(() => null);
		await createApi()('/x').catch(() => null);
		expect(hook).toHaveBeenCalledTimes(2);
		expect(seen).toEqual([]);
	});
});

describe('refusesOwnSession', () => {
	test('matches only porte own-session 403', () => {
		const refusal = { status: 403, code: 'permission_denied', message: OWN_SESSION_REFUSAL };
		expect(refusesOwnSession(new ApiError(403, 'permission_denied', OWN_SESSION_REFUSAL))).toBe(true);
		expect(refusesOwnSession(refusal)).toBe(true);
		expect(refusesOwnSession(new ApiError(403, 'permission_denied', 'read only'))).toBe(false);
		expect(refusesOwnSession(new ApiError(401, 'permission_denied', OWN_SESSION_REFUSAL))).toBe(false);
		expect(refusesOwnSession(null)).toBe(false);
	});
});

describe('session helpers', () => {
	test('probeSession maps 401 and 403 to null, rethrows the rest', async () => {
		reply(401);
		expect(await probeSession(createApi())).toBeNull();
		reply(403);
		expect(await probeSession(createApi())).toBeNull();
		reply(200, { id: 1 });
		expect(await probeSession(createApi())).toEqual({ id: 1 });
		reply(500);
		expect(probeSession(createApi())).rejects.toBeInstanceOf(ApiError);
	});

	test('probeSession does not trigger the 401 policy', async () => {
		const hook = mock(() => undefined);
		reply(401);
		await probeSession(createApi({ onUnauthorized: hook }));
		expect(hook).not.toHaveBeenCalled();
	});

	test('authConfig reads /auth/config quietly', async () => {
		const hook = mock(() => undefined);
		reply(200, { sso_only: true, oidc_enabled: true });
		expect((await authConfig(createApi({ onUnauthorized: hook }))).sso_only).toBe(true);
		expect(globalThis.fetch).toHaveBeenCalledWith('/api/auth/config', expect.anything());
	});

	test('spaceQuery and withSpace', () => {
		expect(spaceQuery(null)).toBe('');
		expect(spaceQuery('')).toBe('');
		expect(spaceQuery(0)).toBe('?space_id=0');
		expect(spaceQuery('a b')).toBe('?space_id=a%20b');
		expect(withSpace('/ideas', 7)).toBe('/ideas?space_id=7');
		expect(withSpace('/ideas?x=1', 7)).toBe('/ideas?x=1&space_id=7');
		expect(withSpace('/ideas', undefined)).toBe('/ideas');
	});

	test('forgetLegacyTokens removes every key and survives blocked storage', () => {
		const gone: string[] = [];
		forgetLegacyTokens(['a', 'b'], { removeItem: (key) => void gone.push(key) });
		expect(gone).toEqual(['a', 'b']);
		expect(() =>
			forgetLegacyTokens(['a'], {
				removeItem: () => {
					throw new Error('blocked');
				}
			})
		).not.toThrow();
	});
});

describe('createBlobApi', () => {
	test('returns the blob and throws the envelope on failure', async () => {
		globalThis.fetch = mock(async () => new Response('PDF', { status: 200 })) as unknown as typeof fetch;
		const blob = await createBlobApi()('/export');
		expect(await blob.text()).toBe('PDF');
		reply(404, { error: { code: 'not_found', message: 'gone' } });
		const error = await failure(createBlobApi()('/export'));
		expect([error.status, error.code, error.message]).toEqual([404, 'not_found', 'gone']);
	});
});
