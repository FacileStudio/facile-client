# @facile/client

The browser half of the Facile suite contract, for SvelteKit clients. It holds the fetch kernel,
the shared 401 redirect, a session store and a theme store. Sixteen clients each carried their own
copy of these in `src/lib/backend.ts` and `theme.svelte.ts`.

It ships no UI. Components live in [`@facile/muse`](https://github.com/FacileStudio/muse).

## Install

```sh
bun add "github:FacileStudio/facile-client#v0.1.0"
```

The package is consumed from source, like muse: there is no build step on install. `svelte` 5 and
`@sveltejs/kit` 2 are peer dependencies. There are no runtime dependencies.

## What it does

| Import | Gives you |
|---|---|
| `@facile/client` | `createApi`, `ApiError`, `isUnauthorized`, `CSRF_HEADER`, `redirectToLogin`, `loginTarget` |
| `@facile/client/session` | `createSession<User>(api)`: `user`, `loading`, `refresh()`, `logout()` as runes state |
| `@facile/client/theme` | `createTheme(key)`: `mode`, `resolved`, `restore()`, `set(mode)` as runes state |

`createApi` follows what the suite's apps and porte already agree on:

- Every call goes to `base` (default `/api`). `base` must be a same-origin path; an absolute URL
  throws. The deployment is one container on one hostname, so there is no API host to configure.
- `credentials: 'same-origin'`. The session is porte's HttpOnly cookie. No token goes in
  `localStorage`.
- Every method except `GET`, `HEAD` and `OPTIONS` carries `X-Facile-CSRF: 1`. porte
  (`porte.CSRFHeaderName`) checks that the header is present and not empty, and refuses a
  cookie mutation without it with 403.
- A non-2xx answer throws `ApiError { status, code, message, upgradeUrl }`, read from tronc's
  envelope `{"error":{"code","message","upgrade_url"}}`. A body that is not the envelope gives an
  empty `code` and `Request failed with status <n>`.
- `onUnauthorized` runs on 401 only. A 403 is a missing CSRF header or an app permission check,
  and signing in again fixes neither. Pass `{ quiet: true }` as the third argument to skip it.
- A 204 or an empty body resolves to `undefined`. A 2xx body that is not JSON (the SPA catch-all
  answering a mistyped path with HTML) throws `ApiError` with code `invalid_response`.

`redirectToLogin` sends the browser to `/login?next=<path+search>` with `replaceState`, and does
nothing on `/login` itself, which probes the session and expects a 401.

`createSession` reads `GET /auth/me` and takes `body.user` (pass `read` for an app that answers
the user bare). A 401 sets `user` to `null`; any other failure rethrows and keeps the user, so a
network blip is not a sign-out. `logout()` posts `/auth/logout`.

`createTheme(key)` writes the same classes as muse's `applyTheme`: `.dark` or `.light` on
`<html>`, neither for `system`. Pass the app's existing `localStorage` key so stored preferences
survive the switch.

## Before and after: Sonde

Before, `apps/client/src/lib/backend.ts` opens with about 60 lines of kernel:

```ts
import { browser } from '$app/environment';
import { goto } from '$app/navigation';

const backendBaseUrl = '/api';

type ApiErrorPayload = { error?: { message?: string } };

function sessionRefused() {
	if (!browser) return;
	const here = window.location.pathname;
	if (here === '/login') return;
	const next = here + window.location.search;
	void goto(`/login?next=${encodeURIComponent(next)}`, { replaceState: true });
}

async function apiFetch<T>(path: string, options: RequestInit = {}, silent = false): Promise<T> {
	const headers = new Headers(options.headers);
	if (!headers.has('Content-Type') && options.body) headers.set('Content-Type', 'application/json');
	if (options.method && options.method !== 'GET') headers.set('X-Facile-CSRF', '1');
	const response = await fetch(`${backendBaseUrl}${path}`, { ...options, headers, credentials: 'same-origin' });
	if (!response.ok) {
		if (response.status === 401 && !silent) sessionRefused();
		/* parse the envelope, throw Error with a status field */
	}
	if (response.status === 204) return undefined as T;
	return (await response.json()) as T;
}
```

After, it is three imports and two lines:

```ts
import { createApi, redirectToLogin } from '@facile/client';
import { createSession } from '@facile/client/session';
import { createTheme } from '@facile/client/theme';

const apiFetch = createApi({ onUnauthorized: redirectToLogin });
export const session = createSession<AuthUser>(apiFetch);
export const theme = createTheme('sonde-theme');
```

`probeSession()` becomes `apiFetch('/auth/me', {}, { quiet: true })`, or `session.refresh()`.

## Develop

```sh
bun install
bun test          # fetch, redirect, session and theme
bun run check     # svelte-check
bun run build     # svelte-package into dist/, with .d.ts files
filet check .
```

`mise run check`, `mise run test` and `mise run build` wrap the same commands. `lefthook.yml` is
muse's: it runs check, test and filet before a push.

## License

MIT. See `LICENSE`.
