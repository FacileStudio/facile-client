/**
 * Deletes the bearer tokens older builds kept in `localStorage`. The browser signs in with porte's
 * HttpOnly cookie, so a stored token is only a credential lying in script-readable storage.
 * Pass the app's old keys, for example `['plume.token', 'token']`. It never throws, because
 * storage may be blocked.
 */
export function forgetLegacyTokens(keys: readonly string[], storage?: Pick<Storage, 'removeItem'>): void {
	try {
		const target = storage ?? localStorage;
		for (const key of keys) target.removeItem(key);
	} catch {
		return;
	}
}
