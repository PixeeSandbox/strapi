# Enforce API token accessKey ownership

## What’s leaking today

- `GET /admin/api-tokens/:id` calls service `getById()` which decrypts `encryptedKey` and returns plaintext `accessKey` unconditionally (so super admins can see everyone’s key).
  - This happens in `[packages/core/admin/server/src/services/api-token.ts](packages/core/admin/server/src/services/api-token.ts)` inside `getBy()`.
- `POST /admin/api-tokens/:id/regenerate` returns a fresh plaintext `accessKey` and currently does **no ownership check** in the controller.

## Target rule (per your decisions)

- **Owner can re-read**: owners may read plaintext `accessKey` via `GET /api-tokens/:id`.
- **Ownerless tokens back-compat**: if `adminUserOwner` is missing, keep legacy behavior for reads (i.e. allow accessKey to be returned when the caller has the route permission).
- **Super admin**: may list/get/update tokens, but **must not** see plaintext `accessKey` for tokens owned by someone else.

## Implementation plan

### 1) Make `accessKey` optional in the shared contract (so “no key” is representable)

- Update `[packages/core/admin/shared/contracts/api-token.ts](packages/core/admin/shared/contracts/api-token.ts)`:
  - Change `ApiToken.accessKey` from required to optional (and consider also making `encryptedKey` optional since it’s not consistently returned).
  - Keep create response behavior compatible (it will still include `accessKey`).

### 2) Stop decrypting access keys by default in the API token service

- Update `[packages/core/admin/server/src/services/api-token.ts](packages/core/admin/server/src/services/api-token.ts)`:
  - Change `getBy(whereParams)` to **not** select `encryptedKey` and **not** decrypt by default.
  - Add an opt-in flag, e.g. `getBy(whereParams, { includeDecryptedKey: true })`, that:
    - Selects `encryptedKey`.
    - Decrypts and returns plaintext `accessKey`.
  - Update `getById()` / `getByName()` wrappers to accept/pass this option.
  - Ensure auth strategy usage (`getBy({ accessKey: hash(token) })`) continues to work without ever decrypting.

### 3) Enforce “only owner reads accessKey” in the controller

- Update `[packages/core/admin/server/src/controllers/api-token.ts](packages/core/admin/server/src/controllers/api-token.ts)`:
  - Add helper `canReadAccessKey(user, token)`:
    - If `token.adminUserOwner` is missing/null → **true** (your back-compat choice).
    - Else → `ownerId === user.id` (super admin does **not** bypass).
  - Update `get()`:
    - Fetch token without decrypted key.
    - If `canReadAccessKey(...) === true` → refetch with `{ includeDecryptedKey: true }` and return that.
    - Else → return token without `accessKey`.
  - Update `regenerate()`:
    - Fetch token (owner info).
    - If token has an owner and caller is not the owner → `403`.
    - Else (owner or ownerless legacy) → proceed; return plaintext key (caller is allowed to read).

### 4) Admin UI: treat `accessKey` as optional and avoid truthy checks

- Update `[packages/core/admin/admin/src/pages/Settings/pages/ApiTokens/EditView/EditViewPage.tsx](packages/core/admin/admin/src/pages/Settings/pages/ApiTokens/EditView/EditViewPage.tsx)`:
  - Replace `!!apiToken?.accessKey` / `apiToken?.accessKey && ...` with explicit comparisons (e.g. `apiToken?.accessKey !== undefined` and `apiToken.accessKey !== ''`).
  - Resulting UX:
    - Owners still see “View token” enabled after refresh.
    - Super admins viewing someone else’s token will not see the token (button disabled / box not shown).

### 5) Tests updates/additions

- Update service tests in `[packages/core/admin/server/src/services/__tests__/api-token.test.ts](packages/core/admin/server/src/services/__tests__/api-token.test.ts)`:
  - Fix/create tests around the new `getBy(..., { includeDecryptedKey })` behavior (default no plaintext key; opt-in returns it).
  - Update create tests if needed to pass a mocked `callingUser` now that ownership defaulting requires an authenticated user (non-super-admin).
- Add a focused controller test (if controller test harness exists in this repo) to assert:
  - Super admin `GET /api-tokens/:id` for someone else → response has **no** `accessKey`.
  - Owner `GET /api-tokens/:id` → response **includes** `accessKey`.
  - Ownerless legacy token `GET` → response **includes** `accessKey`.

## Notes / follow-ups (optional)

- Ownerless tokens are a permanent escape hatch under the back-compat choice; if you want to fully enforce the rule later, we can add a migration path (e.g. “claim ownership” or “force regenerate to set owner”).
