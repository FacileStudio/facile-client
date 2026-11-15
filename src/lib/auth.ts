import { ApiError } from './errors.js';
import type { Api } from './fetch.js';

/** `GET /api/auth/config`: porte's two keys, plus the ones an app or Registre may add. */
export type AuthConfig = {
	sso_only: boolean;
	oidc_enabled: boolean;
	oidc_issuer?: string;
	password_required?: boolean;
	allow_registration?: boolean;
	account_url?: string;
};

/** Reads `/auth/config`, which is public: a 401 never reaches the 401 policy. `T` adds an app's own keys. */
export function authConfig<T extends AuthConfig = AuthConfig>(api: Api): Promise<T> {
	return api<T>('/auth/config', {}, { quiet: true });
}

/**
 * Asks who is signed in without sending anyone to the login page. Resolves to `null` for a 401 or
 * a 403 and rethrows anything else, so a network blip or a 500 is not mistaken for a logout.
 */
export async function probeSession<T>(api: Api, path = '/auth/me'): Promise<T | null> {
	try {
		return (await api<T>(path, {}, { quiet: true })) ?? null;
	} catch (error) {
		if (error instanceof ApiError && (error.status === 401 || error.status === 403)) return null;
		throw error;
	}
}
