# Uncommitted changes review (feat/mcp/api-tokens)

## Scope (files changed)

- **Admin content-types**
  - `packages/core/admin/server/src/content-types/Permission.ts`
  - `packages/core/admin/server/src/content-types/User.ts`
  - `packages/core/admin/server/src/content-types/api-token.ts`
- **Admin API token HTTP layer**
  - `packages/core/admin/server/src/routes/api-tokens.ts`
  - `packages/core/admin/server/src/controllers/api-token.ts`
  - `packages/core/admin/server/src/validation/api-tokens.ts`
  - `packages/core/admin/shared/contracts/api-token.ts`
- **Admin permission domain/services**
  - `packages/core/admin/server/src/domain/permission/index.ts`
  - `packages/core/admin/server/src/services/permission/queries.ts`
  - `packages/core/admin/server/src/services/api-token.ts` (**main business logic**)
- **Admin UI — permission matrix (ceiling-aware)**
  - `packages/core/admin/admin/src/pages/Settings/pages/Roles/utils/createPermissionChecker.ts` (**new**)
  - `packages/core/admin/admin/src/pages/Settings/pages/Roles/utils/updateValues.ts`
  - `packages/core/admin/admin/src/pages/Settings/pages/Roles/hooks/usePermissionsDataManager.tsx` (replaced `.ts`; adds `checkUserHasPermission`)
  - `packages/core/admin/admin/src/pages/Settings/pages/Roles/components/Permissions.tsx`
  - `packages/core/admin/admin/src/pages/Settings/pages/Roles/components/CollapsePropertyMatrix.tsx`
  - `packages/core/admin/admin/src/pages/Settings/pages/Roles/components/ContentTypeCollapses.tsx`
  - `packages/core/admin/admin/src/pages/Settings/pages/Roles/components/GlobalActions.tsx`
  - `packages/core/admin/admin/src/pages/Settings/pages/Roles/components/ConditionsModal.tsx`
  - `packages/core/admin/admin/src/pages/Settings/pages/Roles/components/PluginsAndSettings.tsx`
  - `packages/core/admin/admin/src/pages/Settings/pages/ApiTokens/EditView/components/AdminPermissions.tsx` (**new**)
  - `packages/core/admin/admin/src/pages/Settings/pages/ApiTokens/EditView/EditViewPage.tsx`
  - `packages/core/admin/admin/src/pages/Settings/pages/ApiTokens/EditView/components/FormApiTokenContainer.tsx`
  - `packages/core/admin/admin/src/pages/Settings/pages/ApiTokens/ListView.tsx`
  - `packages/core/admin/admin/src/pages/Settings/components/Tokens/Table.tsx`

## High-level outcome

API Tokens can now optionally:

- **Have an admin “owner”** (`adminUserOwner`) for access control / provenance.
- **Carry admin permissions** (`adminPermissions`) stored as regular `admin::permission` rows linked to the token (not to a role).

This introduces a service-layer rule: **a non-super-admin can only assign token admin permissions within their own admin permission ceiling**, and token permission **conditions are inherited (not chosen)**.

A second business rule is enforced: **only the owner of a token may read the plaintext access key**. Super admins can list, get metadata, and update tokens of other users, but they **never** see the `accessKey` (the value used for authentication). Ownerless (legacy) tokens keep back-compat: any caller with route permission can read the access key.

## Data model changes (admin content-types)

- **`admin::permission`**
  - Added nullable relation **`apiToken`** (many permissions → one api-token).
  - `role` explicitly marked `required: false` (to allow “token permissions” that have no role).
- **`admin::api-token`**
  - Added **`adminPermissions`** one-to-many relation to `admin::permission` mapped by `permission.apiToken`.
  - Added **`adminUserOwner`** many-to-one relation to `admin::user`.
- **`admin::user`**
  - Added **`apiTokens`** one-to-many relation mapped by `apiToken.adminUserOwner`.

## Admin UI — permission matrix (ceiling-aware)

### Overview

The API token edit view now exposes an **Admin** permissions tab backed by the same matrix component used in the Roles edit page, extended with ceiling enforcement so users can only grant permissions within their own admin permission scope.

### Tab visibility rules in the edit view

- **Creating a new token** → only the Admin permissions matrix is shown (no Legacy tab).
- **Editing an owned token** (`adminUserOwner` is set) → two tabs: **Legacy** (existing content-API permissions) and **Admin** (admin permissions matrix).
- **Editing a legacy ownerless token** → only the Legacy tab (unchanged behavior, full back-compat).

### `Roles/utils/createPermissionChecker.ts` (new)

Two exported helpers used during bulk checkbox operations:

- `createFieldPermissionChecker(actionId, subject, userPermissions)` — returns a path-based checker that gates field-level leaf updates to the user's allowed fields for that action/subject pair.
- `createDynamicActionPermissionChecker(subject, actionId, userPermissions)` — same but resolves the `actionId` from the path when toggling a whole content-type row.

Both return `undefined` when `userPermissions` is absent, which signals "Role editing mode — no restrictions".

### `Roles/utils/updateValues.ts`

Added `updateValuesWithPermissions(obj, valueToSet, permissionChecker?, currentPath?, isFieldUpdate?)`:

- When `permissionChecker` is `undefined`, delegates to the original `updateValues` (Role editing, no change in behavior).
- When `permissionChecker` is provided (App Token editing), only sets leaf booleans to `valueToSet` if the checker approves the path; otherwise preserves the existing value.

### `Roles/components/Permissions.tsx`

Added optional `userPermissions?: AuthPermission[]` prop (the calling admin's own permissions, used as the ceiling):

- All dispatch handlers forward `userPermissions` to the reducer.
- **`ON_CHANGE_COLLECTION_TYPE_GLOBAL_ACTION_CHECKBOX`**: uses `createFieldPermissionChecker` + `updateValuesWithPermissions`; calls `inheritConditionsAtPath` on enable.
- **`ON_CHANGE_COLLECTION_TYPE_ROW_LEFT_CHECKBOX`**: gates simple field booleans and nested field objects through the ceiling checker; calls `inheritConditionsAtPath` on enable.
- **`ON_CHANGE_CONDITIONS`**: becomes a no-op when `userPermissions` is present (conditions are inherited, not user-chosen).
- **`ON_CHANGE_SIMPLE_CHECKBOX`**: calls `inheritConditionsAtPath` on enable when in App Token context.
- **`ON_CHANGE_TOGGLE_PARENT_CHECKBOX`**: uses `createDynamicActionPermissionChecker` + `updateValuesWithPermissions`; inherits conditions for the toggled action or all actions in a group.

When `userPermissions` is `undefined` the component behaves exactly as before (Role editing mode).

### UI-level ceiling enforcement (disabled checkboxes + read-only conditions)

So that less-privileged users cannot even *select* permissions outside their ceiling, the matrix **visually disables** checkboxes the user is not allowed to grant. This is implemented via a shared helper in context and updates to all child components that render checkboxes.

#### `Roles/hooks/usePermissionsDataManager.tsx` (replaced `.ts`)

- Context now exposes **`checkUserHasPermission(action, subject?, field?)`**: returns `true` when `userPermissions` is undefined (Role editing, no restrictions), else checks for a matching permission by action + subject and, when `field` is provided, validates the field against `properties.fields` (exact or parent-path match).
- Provider is implemented as a component so it can derive `checkUserHasPermission` from `userPermissions` and pass it through context.

#### Child components (all under `Roles/components/`)

- **`CollapsePropertyMatrix.tsx`**: Threads **`subject`** prop through the component tree. **ActionRow** and **SubActionRow** call `checkUserHasPermission(actionId, subject, fieldPath)` (with `fieldPath` only when `propertyName === 'fields'`) and set `disabled={isFormDisabled || !userHasPermission}` on every field-level and parent checkboxes.
- **`ContentTypeCollapses.tsx`**: Passes **`subject={uid}`** to `Collapse` and `CollapsePropertyMatrix`. **Collapse** uses `checkUserHasPermission(actionId, subject)` to disable action-level checkboxes; passes **`isReadOnly={userPermissions !== undefined}`** to `ConditionsModal`.
- **`GlobalActions.tsx`**: For each global action, checks `checkUserHasPermission(actionId, subject)` for **all** subjects of that action; disables the global checkbox when `!userHasPermissionForAll`.
- **`ConditionsModal.tsx`**: New prop **`isReadOnly?: boolean`**. When `true`: shows inherited-readonly message, syncs local state from `modifiedData` on change, blocks edits in `handleChange`/`handleSubmit`, renders conditions as read-only text instead of `MultiSelectNested`, and footer shows only "Close". **ActionRow** supports **`isReadOnly`** and renders a read-only summary when set.
- **`PluginsAndSettings.tsx`**: **SubCategory** uses `checkUserHasPermission(action, null)` to disable plugin/settings checkboxes; passes **`isReadOnly={userPermissions !== undefined}`** to `ConditionsModal`.

Result: when editing a token as a non-super-admin, only checkboxes for permissions (and fields) the user holds are enabled; condition modal is read-only and reflects inherited conditions.

### `ApiTokens/EditView/components/AdminPermissions.tsx` (new)

Thin wrapper component:

- Fetches the admin permissions layout via `useGetRolePermissionLayoutQuery({ role: '' })` (default layout, no role scoping).
- Reads the calling user's permissions from `useAuth()` to pass as the ceiling.
- Renders `<Permissions ref={...} layout={layout} permissions={initialAdminPermissions} userPermissions={userPermissions} isFormDisabled={disabled} />`.
- Forwards a `PermissionsAPI` ref so the parent can call `getPermissions()` / `setFormAfterSubmit()` on save.

### `ApiTokens/EditView/EditViewPage.tsx`

- Added `adminPermissionsRef = React.useRef<PermissionsAPI>(null)`.
- On **create and update**: collects `adminPermissionsRef.current?.getPermissions().permissionsToSend ?? []` and passes it as `adminPermissions` in the mutation body (both `createToken` and `updateToken` already accept `adminPermissions` via the contract).
- Calls `adminPermissionsRef.current?.setFormAfterSubmit()` after a successful save to sync the form's initial state.
- Contract fix: `ApiTokenBody.adminPermissions` now omits `actionParameters` (consistent with `PermissionsAPI.getPermissions()` return type and `UpdateAdminPermissions.Request`).

## Contracts + validation + routes (public surface)

### Contract changes
In `packages/core/admin/shared/contracts/api-token.ts`:

- `ApiToken` now includes:
  - `adminPermissions?: Permission[]`
  - `adminUserOwner?: Data.ID | AdminUser`
  - `accessKey?: string` and `encryptedKey?: string` (optional so responses can omit the key when caller is not the owner).
- `ApiTokenBody` now accepts:
  - `adminPermissions?: Omit<Permission, 'id' | 'createdAt' | 'updatedAt' | 'actionParameters'>[]`
  - `adminUserOwner?: Data.ID`
- New endpoints:
  - **`GetAdminPermissions`**: `GET /api-tokens/:id/admin-permissions`
  - **`UpdateAdminPermissions`**: `PUT /api-tokens/:id/admin-permissions`

### Input validation changes
In `packages/core/admin/server/src/validation/api-tokens.ts`:

- `adminPermissions` validated as array of `permission` (from `common-validators`).
- `adminUserOwner` accepted as `mixed().nullable()` (no shape enforcement here).

### Route changes
In `packages/core/admin/server/src/routes/api-tokens.ts`:

- Added `GET /api-tokens/:id/admin-permissions` (requires `admin::api-tokens.read`)
- Added `PUT /api-tokens/:id/admin-permissions` (requires `admin::api-tokens.update`)

### Controller changes
In `packages/core/admin/server/src/controllers/api-token.ts`:

- `create()` and `update()` both forward the calling user: `apiTokenService.create(attributes, ctx.state.user)` and `apiTokenService.update(id, attributes, ctx.state.user)` (used for permission-ceiling enforcement and default owner on create).
- `list()` now passes `ctx.state.user` to `apiTokenService.list(ctx.state.user)` so ownership filtering is applied.
- Added helper checks:
  - `canAccessToken(user, token)`: **owner OR super-admin**; legacy tokens (no owner) are accessible.
  - `canReadAccessKey(user, token)`: **owner only** for reading plaintext access key; super admin does **not** bypass. If token has no owner → `true` (back-compat).
  - `canUpdateToken(user, token)`: currently same as `canAccessToken`.
- **Access key visibility**
  - `get()`: fetches token without decrypted key; if `canReadAccessKey(ctx.state.user, token)` then refetches with `{ includeDecryptedKey: true }` and returns that; else returns token without `accessKey`.
  - `regenerate()`: if `!canReadAccessKey(ctx.state.user, token)` → `403`; else proceeds and returns new plaintext key.
- New handlers:
  - `getAdminPermissions`: fetch `admin::permission` rows where `apiToken.id = token.id`, sanitize, return.
  - `updateAdminPermissions`: validates payload (via `validatedUpdatePermissionsInput`), forces `actionParameters: {}` default, then calls `apiTokenService.assignAdminPermissionsToToken(...)`, sanitize, return.

## Business logic added/changed (services)

### `packages/core/admin/server/src/services/api-token.ts`

#### 1) Token now selects/populates owner + admin permissions

- `SELECT_FIELDS` does **not** include `adminUserOwner` (it is a relation)
- `POPULATE_FIELDS` is `['permissions', 'adminPermissions', 'adminUserOwner']`

#### 1b) List: ownership filtering

`list(callingUser: AdminUser)` (required, non-optional):

- Super-admins → no `where` filter; all tokens returned (but `accessKey` is never in `SELECT_FIELDS`, so it is never exposed).
- Regular admins → `where: { $or: [{ adminUserOwner: null }, { adminUserOwner: { id: callingUser.id } }] }` — only ownerless (legacy) tokens and tokens owned by the caller are returned.

#### 1c) Access key: opt-in decryption

- `getBy(whereParams, options?)` no longer selects `encryptedKey` or decrypts by default. Plaintext `accessKey` is **not** returned unless requested.
- Option `{ includeDecryptedKey: true }` selects `encryptedKey`, decrypts, and returns plaintext `accessKey`. Used only when the controller has confirmed the caller is the owner (or legacy ownerless).
- `getById(id, options?)` and `getByName(name, options?)` accept and forward the options.
- Auth strategy `getBy({ accessKey: hash(token) })` is unchanged and never requests decryption.

#### 2) Token creation: default owner and admin-permissions creation

On `create(attributes, callingUser?)`:

- **Owner defaulting**
  - If `adminUserOwner` explicitly provided → `assertOwnerMatchesCallingUser` then use it.
  - Otherwise → `callingUser.id` (required; throws `ValidationError` if no caller). This applies to **all** callers including super admins — no ownerless tokens are created via the UI.
  - Stored in `adminUserOwner` on the token.
- **Admin-permissions handling**
  - Validate admin-permission *actions* exist in admin action provider.
  - Validate permissions exist using existing permission validation (`validatePermissionsExist`).
  - **Enforce ceiling + clamp** via `enforceAdminPermissionsCeiling(callingUser, attributes.adminPermissions)`.
  - Persist admin permissions by creating `admin::permission` rows with:
    - `apiToken = tokenId`
    - `role = null`
  - Returned token includes loaded `adminPermissions` when present.

#### 3) Token update: ceiling enforcement + admin-permissions assignment

On `update(id, attributes, callingUser?)`:

- **Owner immutable**: If `attributes.adminUserOwner` is present, it must equal the existing token’s `adminUserOwner` (no one can change the token’s owner on update). `adminUserOwner` is omitted from the base token write.
- If `attributes.adminPermissions` is present:
  - Validate + enforce ceiling; produce `clampedAdminPermissions`
  - Apply them via `assignAdminPermissionsToToken(id, clampedAdminPermissions)`
- Token update omits `permissions` + `adminPermissions` + `adminUserOwner` from base token write, then loads both relations for the returned payload.

#### 4) Core rule: admin permission “ceiling” enforcement (+ condition inheritance)

`enforceAdminPermissionsCeiling(user, requestedPermissions?) -> PermissionInput[]`:

- **Bypasses**
  - If `requestedPermissions` empty → returns `[]`
  - If user has `SUPER_ADMIN_CODE` role → returns requested as-is
- **Strict**: If admin permissions are requested but `user` is missing → throws `ValidationError` (no ceiling bypass).
- **Matching rule**
  - For each requested permission, it must match at least one user permission by:
    - `action` equality AND
    - `subject` equality, treating “missing subject” as `null`.
- **Field-level ceiling**
  - If any matching user permission has `properties.fields` undefined/empty → treat as “all fields allowed”.
  - Else compute effective allowed fields as **union** across matching permissions’ `properties.fields`.
  - If requested permission specifies fields, they must be a subset of the effective allowed fields.
- **Condition-level enforcement**
  - The caller cannot choose conditions for token permissions.
  - If any matching user permission is unconditional (`conditions` missing/empty) → enforced conditions become `[]`.
  - Else enforced conditions become the **union** across matching permissions’ `conditions`.
  - The returned permission is “clamped” to these enforced conditions.
- If any permission exceeds the ceiling, throws `ValidationError` with a human-readable list (action/subject + optionally field names).

#### 5) Assign admin permissions to token (diff-based)

`assignAdminPermissionsToToken(tokenId, permissions, callingUser?)`:

- Validates permissions exist.
- Enforces ceiling (when caller provided) and uses **clamped** permissions.
- Converts requested permissions into permission objects linked to token (`apiToken`, `role: null`).
- Diffs against existing DB permissions for that token using `arePermissionsEqual` comparing:
  - `conditions`, `properties`, `subject`, `action`, `actionParameters`
- Deletes removed permissions and creates new ones, then returns the full current set.

### `packages/core/admin/server/src/services/permission/queries.ts`

`cleanPermissionsInDatabase()` now:

- Fetches permissions with `populate: ['role', 'apiToken']`.
- Deletes:
  - invalid permissions (existing logic: invalid action/subject/properties), and
  - **orphaned permissions** where **both** `role` and `apiToken` are missing.

This is important because permissions can now be attached to either a role or an api-token; “no role” is no longer automatically invalid, but “no role and no apiToken” is.

### `packages/core/admin/server/src/domain/permission/index.ts`

- Added `apiToken` into `permissionFields` so permission-domain creation/picking preserves token linkage.

## Admin UI — owner display

### Edit view (`FormApiTokenContainer.tsx`)

A read-only **Owner** field is shown in the token details section when:

- `adminUserOwner` is populated as an `AdminUser` object (not just an ID), AND
- the owner's `id` differs from the currently logged-in user's `id`.

This makes the field visible only to super admins viewing another user's token; owners editing their own token see no extra field. Display name is resolved as `firstname + lastname` → `username` → `email`.

### List view (`ListView.tsx` + `Table.tsx`)

Added an **Owner** column to the API tokens list table:

- `TABLE_HEADERS` in `ListView.tsx` gains an `adminUserOwner` entry (label "Owner", non-sortable).
- `Table.tsx` renders the corresponding cell conditionally on `tokenType === 'api-token'`, with the same name-resolution logic. Transfer token rows are unaffected (they keep their 4-column layout; the owner cell is never rendered for them).
- Ownerless / legacy tokens show an empty cell.

## Behavioral implications / notes

- **Security posture improvement**: non-super-admins can't mint API tokens that grant broader admin powers than they personally have.
- **Condition inheritance is a strong constraint**: token admin permissions cannot be "less restrictive" (or arbitrarily different) than the caller's; conditions are enforced from the caller's own role permissions.
- **Field ceiling is enforced only when the user's permission is field-scoped**:
  - If user has "all fields" for a matching permission (no `properties.fields`) then token can request any fields.
- **Token list visibility**: non-super-admins only receive ownerless (legacy) tokens and tokens they own from `GET /api-tokens`. Super admins receive all tokens. Neither role ever receives `accessKey` in the list (it is not in `SELECT_FIELDS`).
- **Access key visibility**: only the token owner can read the plaintext `accessKey` (via `GET /api-tokens/:id` or `POST .../regenerate`). Super admins can list and manage tokens but never see others' keys. Ownerless/legacy tokens (created before this feature) keep back-compat: any caller with route permission can read the key. All tokens created via the UI are now owned by their creator (including super admins — the previous exception that made super-admin-created tokens ownerless has been removed).
- **Admin UI**: Edit view uses explicit checks for `accessKey` (`!== undefined` and `!== ''`) in all three places: initial `apiToken` state, initial `showToken` state, and the render-time `canShowToken` / token box guard. When the API omits the key (e.g. super admin viewing another user's token), "View token" is **hidden** (not merely disabled) and the token box is not shown. The `FormHead` component gates the button render on `canShowToken === true` so it is not rendered at all when the caller is not the owner. Tab visibility (Legacy vs Admin matrix tabs) uses `adminUserOwner !== undefined && adminUserOwner !== null` to correctly distinguish owned tokens from ownerless/legacy ones (`null` ≠ `undefined`).
- **Admin UI — permission matrix**: Ceiling is enforced in two layers: (1) **reducer** blocks state updates for bulk operations and for conditions when `userPermissions` is set; (2) **UI** disables checkboxes the user is not allowed to grant (via `checkUserHasPermission` in context) and shows the conditions modal as read-only when editing a token, so less-privileged users cannot select out-of-ceiling permissions or fields.

## Quick manual test ideas (high signal)

- **Ceiling (action/subject)**
  - As a non-super-admin, try to assign an admin permission you don’t have → expect `ValidationError`.
- **Ceiling (fields)**
  - If your role permission is field-scoped, request a field outside your scope → expect `ValidationError`.
- **Conditions inheritance**
  - If your role permission has conditions, set token permission with different/no conditions → stored permission conditions should match inherited union (or empty if any unconditional match exists).
- **Token list (ownership filter)**
  - As a non-super-admin, `GET /api-tokens` → only ownerless tokens and your own tokens are returned.
  - As super admin, `GET /api-tokens` → all tokens are returned (no `accessKey` in any entry).
- **Ownership**
  - Create a token; confirm `adminUserOwner` defaults to caller.
  - As a different non-super-admin, call `GET /api-tokens/:id/admin-permissions` → expect `403`.
- **Access key (owner-only)**
  - As owner, `GET /api-tokens/:id` → response includes `accessKey`; “View token” works in UI.
  - As super admin, `GET /api-tokens/:id` for a token owned by another user → response has no `accessKey`; “View token” disabled in UI.
  - As super admin, `POST /api-tokens/:id/regenerate` for another user’s token → expect `403`.
  - Ownerless (legacy) token: any user with read permission can `GET` and see `accessKey`.
- **Admin UI — tab visibility**
  - Create a new token → only the Admin permissions matrix is shown (no Legacy tab).
  - Save the token → navigate to its edit page → both Legacy and Admin tabs appear.
  - Open a legacy (ownerless) token → only the Legacy tab appears.
- **Admin UI — ceiling enforcement in matrix**
  - As a non-super-admin, enable a permission you hold → checkbox becomes checked.
  - Try to enable a permission you do not hold → checkbox stays unchecked (silently blocked by ceiling).
  - If your role permission is field-scoped, only allowed fields are selectable; others remain unchecked.
  - Condition checkboxes in the modal are read-only (inherited from your role) when editing a token.
- **Admin UI — save round-trip**
  - Enable some admin permissions on create → save → reopen → same permissions are pre-checked.
  - Uncheck a permission → save → reopen → permission is no longer checked.
