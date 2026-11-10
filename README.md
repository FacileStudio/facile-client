# @facile/client

The browser half of the Facile suite contract, for SvelteKit clients. It holds the fetch kernel,
the shared 401 redirect, a session store and a theme store. Sixteen clients each carried their own
copy of these in `src/lib/backend.ts` and `theme.svelte.ts`.

It ships no UI. Components live in [`@facile/muse`](https://github.com/FacileStudio/muse).

## Install

```sh
bun add "github:FacileStudio/facile-client#v0.2.0"
```

The package is consumed from source, like muse: there is no build step on install. `svelte` 5 and
`@sveltejs/kit` 2 are peer dependencies. There are no runtime dependencies.

## Adopting it

Five things adopters have hit so far.

**Exclude it from Vite's dependency optimizer.** The package ships uncompiled Svelte source
(`.svelte.ts` rune modules), like muse. Vite's pre-bundler does not run the Svelte compiler on
it, so the runes reach the browser untransformed. Add it next to muse in `vite.config.ts`:

```ts
optimizeDeps: {
	exclude: ['@facile/muse', '@facile/client']
},
```

**Probe the session quietly on a public page.** A page an anonymous visitor may open (a status
page, a landing page, `/login`) and that asks "is someone signed in?" must pass `{ quiet: true }`.
Without it the 401 reaches `onUnauthorized`, which with `redirectToLogin` sends the visitor to
`/login`:

```ts
const me = await api('/auth/me', {}, { quiet: true }).catch(() => null);
```

**Mock `$app/*` in bun tests.** The root entry imports `redirectToLogin`, which imports
`$app/environment` and `$app/navigation`. Those exist only inside SvelteKit, so a `bun test` that
imports `@facile/client`, or a module that does, fails to resolve them. Mock both, then import
dynamically, because a static `import` runs before the mocks:

```ts
import { mock } from 'bun:test';

mock.module('$app/environment', () => ({ browser: true }));
mock.module('$app/navigation', () => ({ goto: async () => {} }));

const { createApi } = await import('@facile/client');
```

**An app with no `/api/auth/me` passes its own probe path.** `createSession` reads `/auth/me` by
default. An app whose read-only session probe lives elsewhere passes it as `mePath`, for example
sonar's `/auth/session`:

```ts
export const session = createSession<SessionUser>(api, { mePath: '/auth/session' });
```

**Map `/api/me/invitations` with `invitationsFrom` before muse's `UserMenu` sees it.** An error
answer has no `href`, and `UserMenu` must get `null` then, not the raw body. `invitationsFrom`
returns `{ count, href }` or `null`:

```ts
invitations = await api('/me/invitations', {}, { quiet: true }).then(invitationsFrom, () => null);
```

## What it does

| Import | Gives you |
|---|---|
| `@facile/client` | `createApi`, `ApiError`, `isUnauthorized`, `CSRF_HEADER`, `redirectToLogin`, `loginTarget`, `invitationsFrom` |
| `@facile/client/session` | `createSession<User>(api)`: `user`, `loading`, `refresh()`, `logout()` as runes state |
| `@facile/client/theme` | `createTheme(key, { resolveSystem })`: `mode`, `resolved`, `restore()`, `set(mode)`, `destroy()` as runes state |
| `@facile/client/native` | `createNativeApi({ origin, token, onUnauthorized })`, for Tauri and Capacitor shells only |

`createApi` follows what the suite's apps and porte already agree on:

- Every call goes to `base` (default `/api`). `base` must be a same-origin path; an absolute URL
  throws. The deployment is one container on one hostname, so there is no API host to configure.
- `credentials: 'same-origin'`. The session is porte's HttpOnly cookie. No token goes in
  `localStorage`.
- Every method except `GET`, `HEAD` and `OPTIONS` carries `X-Facile-CSRF: 1`. porte
  (`porte.CSRFHeaderName`) checks that the header is present and not empty, and refuses a
  cookie mutation without it with 403.
- A non-2xx answer throws `ApiError { status, code, message, upgradeUrl, retryAfterSeconds, details }`,
  read from tronc's envelope `{"error":{"code","message","upgrade_url"}}`. A body that is not the
  envelope gives an empty `code`, empty `details` and `Request failed with status <n>`.
- `details` is the envelope's whole `error` object, frozen, with every field the server sent,
  including ones `ApiError` does not type. A 402 reads straight into muse's `PlanLimit` with no
  second fetch: `if (error.status === 402) limit = planLimitFrom(error.details)`.
- `retryAfterSeconds` is the `Retry-After` header in seconds: a non-negative integer as sent, or an
  HTTP date turned into the seconds from now until it, never below 0. It is `null` when the header
  is missing or is neither. Show it on a 429's retry button instead of reading the header yourself.
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
survive the switch. `destroy()` removes the OS-preference listener `restore()` adds.

An app with Tailwind `dark:` utilities needs `.dark` on `<html>` in `system` mode too, which
muse's contract never writes. Pass `{ resolveSystem: true }`: in `system` mode the store then
writes `.dark` or `.light` to match the OS, and switches it when the OS setting changes.

Put the matching one-line script in `app.html`'s `<head>`, before `%sveltekit.head%`, so the
first paint already has the right class. Replace the key with the one you pass to `createTheme`.

Default (muse's contract, no class for `system`):

```html
<script>try{var t=localStorage.getItem('sonde-theme');if(t==='dark'||t==='light')document.documentElement.classList.add(t)}catch(e){}</script>
```

With `resolveSystem: true` (always one class):

```html
<script>(function(){var t;try{t=localStorage.getItem('plume.theme')}catch(e){}if(t!=='dark'&&t!=='light')t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.classList.add(t)})()</script>
```

## Native shells: `@facile/client/native`

A Tauri or Capacitor build is served from its own origin, so it calls the API by absolute URL
with a bearer token and cannot send the CSRF header through tronc's CORS. That kernel is a
separate entry point, so a browser build cannot reach it by accident: the root `createApi` still
throws on an absolute `base` and never reads a token.

```ts
import { createApi, redirectToLogin } from '@facile/client';
import { createNativeApi } from '@facile/client/native';
import { clearToken, getToken, isApp } from '$lib/platform';

export const api = isApp()
	? createNativeApi({ origin: 'https://courrier.facile.studio', token: getToken, onUnauthorized: clearToken })
	: createApi({ onUnauthorized: redirectToLogin });
```

- `origin` must be a bare `https://` origin; `http://` is accepted only for `localhost`,
  `127.0.0.1` and `[::1]`. A path, credentials or any other scheme throws. Paths stay relative to
  `base` (default `/api`), exactly as in `createApi`.
- `token()` runs before every request. When it resolves to a string the request carries
  `Authorization: Bearer <token>`; `null` sends none. A request that already sets
  `Authorization` keeps it and `token()` is not called.
- `credentials: 'omit'` and no `X-Facile-CSRF`, even if the caller passed one.
- Errors, 204, `quiet` and `ApiError.details` behave as in `createApi`. `onUnauthorized` may
  return a promise, and the call waits for it before it throws.

A bearer token must never be kept in `localStorage` or `sessionStorage`. The `token` callback
should read it from the platform's secure storage (the Android Keystore or iOS Keychain through a
Capacitor secure-storage plugin, the OS keychain through a Tauri command) and cache it in memory.

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

@facile/client is licensed under the [MIT License](LICENSE).
