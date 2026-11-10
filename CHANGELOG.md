# Changelog

## [Unreleased]

### Changed

- `package.json` declares `"license": "MIT"`, matching `LICENSE`. The licence itself is unchanged.

## [0.1.0] - 2026-11-10

### Added

- `createApi({ base, onUnauthorized })`: the fetch kernel. Same-origin paths only, `credentials: 'same-origin'`, `X-Facile-CSRF: 1` on every method but GET, HEAD and OPTIONS, the tronc error envelope parsed into `ApiError { status, code, message, upgradeUrl }`, `onUnauthorized` on 401 only, `undefined` for 204 and empty bodies, and a `quiet` call option.
- `redirectToLogin` and `loginTarget`: the shared 401 handler, `/login?next=<path+search>`, a no-op on `/login`.
- `@facile/client/session`: `createSession<User>(api)` with `user`, `loading`, `refresh()` and `logout()` as runes state.
- `@facile/client/theme`: `createTheme(key)` with `mode`, `resolved`, `restore()` and `set()`, writing the same classes as muse's `applyTheme`.
