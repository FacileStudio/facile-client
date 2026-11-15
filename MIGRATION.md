# Migrating an app to @facile/client 0.3

Every change is additive. An app on 0.2.0 keeps working after the bump. Replace one local file at
a time. Paths are under `apps/client/src/lib/` unless noted, read on each repo's default branch on
2026-11-16. Re-check a line number before you edit: it moves.

Bump first: `"@facile/client": "github:FacileStudio/facile-client#v0.3.0"`. Apps still on v0.1.x
also gain `details`, `native`, `invitationsFrom` and `resolveSystem` from 0.2.0.

One behaviour change reaches every `createApi` and `createNativeApi` caller: a request with no
answer now throws `ApiError` (`status` 0, `code` `'network'`), where it threw the browser's
`TypeError`. No app catches `TypeError` from the client today. A catch that checks `err instanceof
ApiError` now also sees offline failures; read `err.status === 0` if the branch must tell them apart.

## 1. Kernel copies

| Local code | Replace with | Apps |
|---|---|---|
| Whole kernel in `backend.ts` (own `ApiError`, own CSRF, own `Retry-After` parser) | `createApi({ unauthorized: 'login' })` or `onUnauthorized: redirectToLogin`. `ApiError.retryAfterSeconds` covers the parser. | Antenne (231 lines), sonar (`lib/api.ts`) |
| `fetch` + `X-Facile-CSRF` + `status` mapping, `response.text()` throws | `createApi` from `@facile/client/core` | Opus web `apps/web/src/lib/auth-client.ts` and `fetchers/**`, Echo (CSRF literal in 5 files) |
| Second `ApiError` wrapping the kernel's | Delete it, import `ApiError`. Keep the `upgradeUrl` check at the call site. | Courrier (`backend.ts` ~201), Nuage (~300) |
| `?? {}` after a call | Keep it. The kernel still returns `undefined` for 204. | Agenda, Nuage |

React and other non-Svelte code (Opus web) imports `@facile/client/core`. It has no `$app/*` and no
Svelte import. Opus web passes no `{ mutation: true }` flag any more: the method decides the CSRF
header. The five `fetchers/nook-pool/*.ts` and `lib/upload-task-image.ts` that send a POST or
DELETE with `credentials: "include"` and no CSRF header get it for free.

Prefer `import ... from '@facile/client'` in SvelteKit apps. `core` is the same code.

## 2. The 401 policy

| Today | Option |
|---|---|
| `onUnauthorized: redirectToLogin` (soft navigation) | Keep. Nothing to change. |
| Full-page redirect to `/login?next=` | `unauthorized: 'login'` |
| Redirect straight to SSO (no login page) | `unauthorized: 'sso'`, `ssoPath: '/auth/oidc'` if the path is not `/api/auth/oidc` |
| Own hook | `unauthorized: (response) => ...`, or `onUnauthorized` as before |
| No handler (Capsule, 401 left to callers) | Leave out. Default is unchanged. |

Native apps (Courrier, Toile, Place, Bulle) keep `createNativeApi({ onUnauthorized: clearToken })`.
Place's `loginFacile` and Capsule/Toile `pending` pages call `location.assign` on a button click, which is
not a 401 reaction. Leave them.

## 3. `refusesOwnSession`

| Local | Import |
|---|---|
| `session-refusal.ts` (byte-identical): Capsule, Journal, Courrier, Nuage | Delete the file. `import { refusesOwnSession, OWN_SESSION_REFUSAL } from '@facile/client'`. Update the imports in the pages that use it. |
| `notOwnSession` and a local `OWN_SESSION_REFUSAL` in `backend.ts` (Agenda ~14, Vision ~15) | Same import. Rename call sites from `notOwnSession(err)` to `refusesOwnSession(err)`. |

## 4. Session, config, spaces, tokens

| Local | Import | Apps |
|---|---|---|
| `currentUser()` / `probeSession()` doing `quiet` and mapping 401 and 403 to `null` | `probeSession<User>(api, path?)` | Plume (`currentUser`, `/auth/me`), Sonde (`probeSession` is the bare quiet call: now `probeSession(api)`), Journal, Casier `auth.svelte.ts`. Apps on `createSession` keep it. |
| Raw `fetch('/api/auth/config').then(r => r.json())` | `authConfig(api)` | Plume `(app)/spaces/+page.svelte` ~55, Vision `(app)/team/+page.svelte` ~24 and `team/[id]/+page.svelte` ~80, Agenda `settings/AdvancedPanel.svelte` ~26, Sablier `journal.ts` ~21 |
| `authConfig: () => apiFetch<AuthConfig>('/auth/config')` plus a local `AuthConfig` type | `import { authConfig, type AuthConfig }`; pass an extended type as `authConfig<Mine>(api)` | Antenne, Bulle, Casier, Courrier, Journal, Mycelium, Place (`AuthConfigResponse`), Prisme, Bobine |
| `const spaceQuery = (id) => id === null ? '' : \`?space_id=${id}\`` | `spaceQuery`, `withSpace(path, id)` | Agenda `backend.ts` 200 (also line 273, `URLSearchParams`), Nuage `backend.ts` 309, Courrier `backend.ts` 267 and 388, 392, 558 |
| `\`${path}${sep}space_id=...\`` | `withSpace(path, id)` | Bulle `spaces.svelte.ts` 51 |
| `scoped()` / `scope()` helpers | `withSpace` | Docs, Feuilles, Mycelium (`spaceQuery`, `treeQuery`: keep `treeQuery`) |
| Forget old bearer token in a try/catch | `forgetLegacyTokens(keys, storage?)` | Journal `routes/+layout.svelte` 23: `['journal.token']`. Plume `backend.ts` 5-18: `['plume.token', 'token']`. Courrier `platform.ts` 140: keep the `app` guard, call `forgetLegacyTokens([TOKEN_KEY], storage)` inside it. Nuage, Place, Vision, Sablier, Mycelium: pass the key constant they already hold. |

`withSpace` treats `0` as an id and `null`, `undefined` and `''` as no space. Agenda's `!= null`
check behaves the same.

## 5. Blobs and uploads

| Local | Import | Apps |
|---|---|---|
| `fetch(...).then(r => r.blob())`, then anchor and `URL.createObjectURL` | `createBlobApi(sameOptionsAsApi)` and `saveBlob(blob, name)` | Sonde `backend.ts` 49 `download()`, Plume `documents/[id]/+page.svelte` 225, Vision `sites/[id]/+page.svelte` 374, Echo `transcript.ts` 35 |
| `attachmentObjectUrl` building an object URL from a blob | `URL.createObjectURL(await blobApi(path))` | Bulle `backend.ts` 155, Courrier `backend.ts` 539 |
| XHR with `upload.onprogress` | `uploadWithProgress(url, body, { headers, signal, onProgress })` | Nuage `uploadFileWithProgress` (passes `(loaded, total)`: unchanged) and `uploadChunk` (`method: 'PUT'`, `headers: { 'Content-Type': 'application/octet-stream' }`), Place `uploadMedia` (`Math.round(loaded / total * 100)` in the callback), Bulle `uploadFile` (`loaded / total`) |

A blob call applies the same 401 policy as `createApi`. Pass `{ quiet: true }` as the third
argument to skip it. A failed upload now carries the envelope's `code` and `details`. Nuage can read
`planLimitFrom(error.details)` and drop `uploadFailure`. A 401 only rejects: call your own handler.
Place's `AbortError` and Bulle's `abort()` map to the `signal` option.

## 6. Locale

Delete the `cookieLocale()`, `localeSource()` and `rememberLocale()` block in `lib/i18n/index.svelte.ts`.
Keep `bindLocale`, `locale()`, `t` and the catalogs: they feed muse's `createTranslator`.

```ts
import { resolveClientLocale, rememberLocale } from '@facile/client/locale';
import { LOCALES } from '@facile/muse';

const resolved = $derived(resolveClientLocale({ supported: LOCALES, profile: session.locale }));
provideLocale(() => resolved.hint);
```

`LOCALES` has four entries (`fr`, `en`, `es`, `de`) and includes `en`. Pass your app's own list
if it supports fewer. `rememberLocale(locale)` replaces the local `document.cookie` writer and now
sets `Domain=.facile.studio` under the suite. It keeps the choice across apps.

The order is the same for every app: URL, profile, cookie, browser, English. This changes the order
for two of the three groups:

| Group | Old order | Change |
|---|---|---|
| Agenda, Antenne, Casier, Nuage, Plume, Prisme, Sonde, Vision | cookie, profile, browser | A profile locale now beats the cookie. |
| Bulle, Courrier, Sablier, Mycelium | profile, cookie, browser | None (plus `?lang=` first, `navigator.languages`). |
| Capsule, Toile, sonar, Opus site, Pastille, Gare, Feuilles and Docs guests | cookie, browser | A profile locale now counts. Pass `profile: undefined` to keep a guest-only app. |
| Journal | cookie, `navigator.languages`, profile | Profile now beats cookie. |
| Glouton (server) | cookie, profile, `Accept-Language` | `resolveServerLocale` in `hooks.server.ts`; keep `%lang%` templating. |

Apps that force French or a fixed locale (Docs and Place when signed in, Ardoise, Tempo, Boutique)
are a product decision, not a drop-in swap. Pass the resolver's `locale`, and move the `'fr'`
literals out of `+layout.svelte`, `i18n/index.svelte.ts` and `app.html` in the same change. The
prerendered roots of Suite, vitrine and Scribe cannot read `Accept-Language`: they need a client-side
redirect to `/en` on the first visit, using `resolveClientLocale` and `rememberLocale`.

Apps that never had a client resolver and read `navigator.language` (Opus site, Pastille) now read
every entry of `navigator.languages`.

Registre's own order (`?lang=`, `localStorage['registre.locale']`, `navigator.languages`) is the
same minus the cookie and profile. It can adopt `resolveClientLocale` and read the cookie from the
same call.

## 7. `row.ts`: not here

`src/lib/i18n/row.ts` is a one-line type, `readonly [Message, Message, Message, Message]`, and
`Message` comes from `@facile/muse`. This library has no muse dependency, so the type belongs in
muse's i18n exports (`export type Row`). 16 apps carry it byte-identical (md5 16ae1a). Pastille,
Bulle and Toile differ by a line. The muse owner adds the export, then the apps delete their copy.
Nothing in `@facile/client` replaces it.

## Left alone on purpose

- `createSession`, `createTheme`, `createNativeApi`, `invitationsFrom` and `redirectToLogin`: no change.
- Plan-limit state (Echo `planLimit.ts`, Nuage `notePlanLimit`, Bulle `planLimit`): app UI state. Use `ApiError.details`.
- Retry, timeouts, SSE: no app shares them.
