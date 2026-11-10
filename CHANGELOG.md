# Changelog

## [Unreleased]

## [0.2.0] - 2026-11-10

### Added

- `@facile/client/native`: `createNativeApi({ origin, base, token, onUnauthorized })` for Tauri and Capacitor shells. It needs a bare https origin (http only on localhost), sends `Authorization: Bearer` from `token()` on every request unless the caller set one, sends `credentials: 'omit'` and never sends `X-Facile-CSRF`. Errors, 204 and `quiet` behave as in `createApi`, and it waits for an async `onUnauthorized`. The root entry does not export it, still refuses an absolute `base` and never reads a token.
- `ApiError.details`: the envelope's whole `error` object, frozen, with every field the server sent, so `planLimitFrom(error.details)` reads a 402 with no second fetch. It is empty when the body was not the envelope. The typed fields are unchanged.
- `createTheme(key, { resolveSystem: true })`: in `system` mode the store writes `.dark` or `.light` to match the OS and follows it, for apps with Tailwind `dark:` utilities. Without the option the classes are muse's contract, as before.
- `ThemeStore.destroy()`: removes the OS-preference listener `restore()` adds.
- `invitationsFrom(body)` in the root entry: maps a `/api/me/invitations` answer to `{ count, href }`, or `null` without an `href`, which is what muse's `UserMenu` takes.

### Changed

- The README documents the pre-paint `app.html` script for each theme mode, the native entry and its token storage rule, `mePath` for an app with no `/api/auth/me`, and `invitationsFrom`.
- Tests pin the default request and the default theme classes of v0.1.1.

## [0.1.1] - 2026-11-10

### Added

- `ApiError.retryAfterSeconds: number | null`, read from the `Retry-After` header: a non-negative integer of seconds as sent, or an HTTP date as the seconds from now until it, floored at 0; `null` otherwise. The kernel dropped the header before, which kept Antenne on its own fetch code to show the delay on a button.

### Changed

- The README documents what adopters hit: `@facile/client` goes in `optimizeDeps.exclude` next to muse because it ships uncompiled Svelte source, a public page that probes the session calls with `{ quiet: true }`, and a bun test that imports the root entry mocks `$app/environment` and `$app/navigation`.
- `package.json` declares `"license": "MIT"`, matching `LICENSE`. The licence itself is unchanged.

## [0.1.0] - 2026-11-10

### Added

- `createApi({ base, onUnauthorized })`: the fetch kernel. Same-origin paths only, `credentials: 'same-origin'`, `X-Facile-CSRF: 1` on every method but GET, HEAD and OPTIONS, the tronc error envelope parsed into `ApiError { status, code, message, upgradeUrl }`, `onUnauthorized` on 401 only, `undefined` for 204 and empty bodies, and a `quiet` call option.
- `redirectToLogin` and `loginTarget`: the shared 401 handler, `/login?next=<path+search>`, a no-op on `/login`.
- `@facile/client/session`: `createSession<User>(api)` with `user`, `loading`, `refresh()` and `logout()` as runes state.
- `@facile/client/theme`: `createTheme(key)` with `mode`, `resolved`, `restore()` and `set()`, writing the same classes as muse's `applyTheme`.
