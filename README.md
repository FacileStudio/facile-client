# @facile/client

The browser half of the Facile suite contract. It holds the fetch kernel, the shared 401 handling,
a locale resolver, a session store and a theme store, for SvelteKit clients and, through
`@facile/client/core`, any other client. Sixteen clients each carried their own
copy of these in `src/lib/backend.ts` and `theme.svelte.ts`.

It ships no UI. Components live in [`@facile/muse`](https://github.com/FacileStudio/muse).

## Install

```sh
bun add "github:FacileStudio/facile-client#v0.3.0"
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
| `@facile/client` | everything in `/core`, plus `redirectToLogin` (the SvelteKit soft navigation) |
| `@facile/client/core` | no `$app/*`, no Svelte: `createApi`, `createBlobApi`, `saveBlob`, `uploadWithProgress`, `ApiError`, `isUnauthorized`, `CSRF_HEADER`, `NETWORK_CODE`, `redirectToSso`, `refusesOwnSession`, `probeSession`, `authConfig`, `spaceQuery`, `withSpace`, `forgetLegacyTokens`, `invitationsFrom`, `loginTarget` |
| `@facile/client/locale` | no Svelte: `resolveLocale`, `resolveServerLocale`, `resolveClientLocale`, `rememberLocale`, `localeCookie`, `matchLocale`, `readCookie`, `LOCALE_COOKIE` |
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

## Core: `@facile/client/core`

The root entry re-exports `core` unchanged and adds `redirectToLogin`, which needs `$app/*`. Code
with no SvelteKit (a React app, a worker, a test) imports `@facile/client/core`, which pulls in
neither `$app/*` nor Svelte.

**Network failures.** A request that gets no answer (offline, DNS, CORS, a reset) throws
`ApiError` with `status` 0 and `code` `'network'` (`NETWORK_CODE`), not the browser's bare
`TypeError`. An abort keeps its own `AbortError`.

**The 401 policy.** `createApi({ unauthorized })` takes one of three values. `onUnauthorized` still
works and wins when both are given. With neither, a 401 only throws, as before.

| Value | On a 401 |
|---|---|
| `'login'` | replaces the page with `/login?next=<path+search>` (full load; not on `/login`) |
| `'sso'` | replaces the page with `ssoPath` (default `/api/auth/oidc`), for apps with no login page |
| `(response) => void` | your hook, which may return a promise the call waits for |

A SvelteKit app that wants a client-side navigation keeps `onUnauthorized: redirectToLogin`.

```ts
createApi({ unauthorized: 'sso' });
createApi({ unauthorized: 'sso', ssoPath: '/auth/oidc' });
createApi({ unauthorized: (response) => clearToken() });
```

**Own-session refusal.** `refusesOwnSession(err)` is true for porte's 403 `permission_denied`
"only the person's own session can confirm actions", which signing in again fixes. It takes any
`unknown`, so it works with an `ApiError` or a rewrapped copy.

**Session probe, `/auth/config`, spaces.**

```ts
const me = await probeSession<User>(api);
const config = await authConfig(api);
await api(withSpace('/ideas', spaceId));
```

- `probeSession(api, path = '/auth/me')` is quiet, maps 401 and 403 to `null`, and rethrows
  anything else, so a network blip is not read as a logout.
- `authConfig(api)` reads `GET /auth/config`, quiet, and throws `ApiError` on failure. Pass your
  app's own keys as the type parameter: `authConfig<Config>(api)`.
- `spaceQuery(id)` is `''` for `null`, `undefined` or `''` and `?space_id=<id>` otherwise (URL
  encoded, `0` counts as an id). `withSpace(path, id)` picks `?` or `&`.
- `forgetLegacyTokens(['plume.token', 'token'])` deletes old bearer tokens from `localStorage`
  and never throws on blocked storage. Pass a storage as the second argument to test it.

**Downloads and uploads.**

```ts
const download = createBlobApi({ unauthorized: 'login' });
saveBlob(await download('/documents/3/certificate'), 'certificate.pdf');

await uploadWithProgress('/api/files', form, { onProgress: (loaded, total) => (percent = (loaded / total) * 100) });
```

`createBlobApi` takes the same options as `createApi` and resolves to a `Blob`. `uploadWithProgress`
uses XMLHttpRequest because `fetch` has no upload progress. It sends the cookie and the CSRF
header (`csrf: false` drops it), takes `headers` (a native shell's bearer token), `method` and
`signal`, rejects with the same `ApiError`, and resolves to the parsed JSON.

## Locale: `@facile/client/locale`

One resolver, one order, for every app. It replaces the `cookieLocale()` / `localeSource()` /
`rememberLocale()` block copied into about 19 apps, which had three different orders.

1. Explicit URL locale (a route prefix such as `/en`, or `?lang=`)
2. The signed-in user's profile locale
3. The stored visitor choice, the `fc_locale` cookie
4. The browser language (`Accept-Language` on the server, `navigator.languages` in the browser)
5. English. Never French as a silent default.

A source that is missing, or names a locale the app does not support, is skipped. The app passes
its `supported` list, which must include `en`.

```ts
const supported = ['en', 'fr', 'es', 'de'] as const;

const { locale, hint } = resolveServerLocale({
	supported,
	url: event.url,
	cookie: event.request.headers.get('cookie'),
	acceptLanguage: event.request.headers.get('accept-language'),
	profile: event.locals.user?.locale
});

const resolved = resolveClientLocale({ supported, profile: session.locale });
```

`resolveLocale({ supported, url, profile, stored, browser })` is the pure core, and returns
`{ locale, origin, hint }`. `origin` is `url`, `profile`, `cookie`, `browser` or `default`. `hint`
is `locale`, or `null` when `origin` is `default`.

**Feeding muse.** Pass the hint, not the locale: `provideLocale(() => resolved.hint)`. muse then
reports `I18n.known` as `false` for a visitor who chose nothing and whose browser said nothing, so
its sign-up, pricing and sign-in links add no `?lang=` or `ui_locales`. Passing the English
fallback as a locale makes `known` true and pins the account to English. `createTranslator`
and muse's own `resolveLocale` keep doing their job on the hint; this resolver only decides what
to hand them. muse's `matchLocale` knows exactly four locales, so the supported list lives here.

**Writing the choice.** `rememberLocale(locale)` writes `fc_locale` for a year. Under
`facile.studio` or any subdomain it writes `Domain=.facile.studio`, so a choice made on one app
reaches the others, and deletes the old host-only cookie that would shadow it. Anywhere else
(a self-hoster, localhost) it writes a host-only cookie. On a server, set the header with
`localeCookie(locale, { hostname, secure })`. `localeCookieDomain(hostname, parents)` takes other
parent domains if a deployment needs them.

`readCookie` returns the first `fc_locale` it finds. A visitor who still carries an old host-only
cookie and a new shared one sends both; the next `rememberLocale` call removes the old one.

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
