import type { Context } from 'koa';

import { strings, errors } from '@strapi/utils';
import { trim, has } from 'lodash/fp';
import { getService } from '../utils';
import constants from '../services/constants';
import {
  validateApiTokenCreationInput,
  validateApiTokenUpdateInput,
} from '../validation/api-tokens';
import { validatedUpdatePermissionsInput } from '../validation/permission';

import {
  Create,
  List,
  Revoke,
  Get,
  Update,
  GetAdminPermissions,
  UpdateAdminPermissions,
  ApiToken as ApiTokenType,
} from '../../../shared/contracts/api-token';
import type { AdminUser } from '../../../shared/contracts/shared';

const { ApplicationError } = errors;

/**
 * Check if user can access a token (owner or super-admin)
 */
const canAccessToken = (user: AdminUser, token: ApiTokenType): boolean => {
  if (!token.adminUserOwner) return true; // Legacy tokens
  if (user.roles.some((r) => r.code === constants.SUPER_ADMIN_CODE)) return true;

  // Handle both ID and populated user object
  const ownerId = typeof token.adminUserOwner === 'object' ? token.adminUserOwner.id : token.adminUserOwner;
  return ownerId === user.id;
};

/**
 * Check if user can read the plaintext accessKey of a token.
 * Super admins do NOT bypass this check — only the owner can read the key.
 * Legacy tokens (no owner) keep back-compat: any caller with route permission can read.
 */
const canReadAccessKey = (user: AdminUser, token: ApiTokenType): boolean => {
  if (!token.adminUserOwner) return true; // Legacy / ownerless back-compat

  const ownerId = typeof token.adminUserOwner === 'object' ? token.adminUserOwner.id : token.adminUserOwner;
  return ownerId === user.id;
};

/**
 * Check if user can update a token (owner or super-admin)
 */
const canUpdateToken = (user: AdminUser, token: ApiTokenType): boolean => {
  // Same as canAccessToken for now, but separated for future flexibility
  return canAccessToken(user, token);
};

export default {
  async create(ctx: Context) {
    const { body } = ctx.request as Create.Request;
    const apiTokenService = getService('api-token');

    /**
     * We trim both field to avoid having issues with either:
     * - having a space at the end or start of the value.
     * - having only spaces as value;
     */
    const attributes = {
      name: trim(body.name),
      description: trim(body.description),
      type: body.type,
      permissions: body.permissions,
      adminPermissions: body.adminPermissions,
      adminUserOwner: body.adminUserOwner,
      lifespan: body.lifespan,
    };

    await validateApiTokenCreationInput(attributes);

    const alreadyExists = await apiTokenService.exists({ name: attributes.name });
    if (alreadyExists) {
      throw new ApplicationError('Name already taken');
    }

    const apiToken = await apiTokenService.create(attributes, ctx.state.user);
    ctx.created({ data: apiToken } satisfies Create.Response);
  },

  async regenerate(ctx: Context) {
    const { id } = ctx.params;
    const apiTokenService = getService('api-token');

    const apiTokenExists = await apiTokenService.getById(id);
    if (!apiTokenExists) {
      ctx.notFound('API Token not found');
      return;
    }

    if (!canReadAccessKey(ctx.state.user, apiTokenExists)) {
      return ctx.forbidden();
    }

    const accessToken = await apiTokenService.regenerate(id);

    ctx.created({ data: accessToken });
  },

  async list(ctx: Context) {
    const apiTokenService = getService('api-token');
    const apiTokens = await apiTokenService.list(ctx.state.user);

    ctx.send({ data: apiTokens } satisfies List.Response);
  },

  async revoke(ctx: Context) {
    const { id } = ctx.params as Revoke.Params;
    const apiTokenService = getService('api-token');
    const apiToken = await apiTokenService.revoke(id);

    ctx.deleted({ data: apiToken } satisfies Revoke.Response);
  },

  async get(ctx: Context) {
    const { id } = ctx.params;
    const apiTokenService = getService('api-token');

    // Fetch without decrypted key first to determine ownership
    const apiToken = await apiTokenService.getById(id);

    if (!apiToken) {
      ctx.notFound('API Token not found');
      return;
    }

    if (canReadAccessKey(ctx.state.user, apiToken) === true) {
      const apiTokenWithKey = await apiTokenService.getById(id, { includeDecryptedKey: true });
      if (apiTokenWithKey) {
        ctx.send({ data: apiTokenWithKey } satisfies Get.Response);
        return;
      }
    }

    ctx.send({ data: apiToken } satisfies Get.Response);
  },

  async update(ctx: Context) {
    const { body } = ctx.request as Update.Request;
    const { id } = ctx.params as Update.Params;
    const apiTokenService = getService('api-token');

    const attributes = body;
    /**
     * We trim both field to avoid having issues with either:
     * - having a space at the end or start of the value.
     * - having only spaces as value;
     */
    if (has('name', attributes)) {
      attributes.name = trim(body.name);
    }

    if (has('description', attributes) || attributes.description === null) {
      attributes.description = trim(body.description);
    }

    await validateApiTokenUpdateInput(attributes);

    const apiTokenExists = await apiTokenService.getById(id);
    if (!apiTokenExists) {
      return ctx.notFound('API Token not found');
    }

    if (has('name', attributes)) {
      const nameAlreadyTaken = await apiTokenService.getByName(attributes.name);

      /**
       * We cast the ids as string as the one coming from the ctx isn't cast
       * as a Number in case it is supposed to be an integer. It remains
       * as a string. This way we avoid issues with integers in the db.
       */
      if (!!nameAlreadyTaken && !strings.isEqual(nameAlreadyTaken.id, id)) {
        throw new ApplicationError('Name already taken');
      }
    }

    const apiToken = await apiTokenService.update(id, attributes, ctx.state.user);
    ctx.send({ data: apiToken } satisfies Update.Response);
  },

  async getLayout(ctx: Context) {
    const apiTokenService = getService('api-token');
    // TODO
    // @ts-expect-error remove this controller if not used
    const layout = await apiTokenService.getApiTokenLayout();

    ctx.send({ data: layout });
  },

  async getAdminPermissions(ctx: Context) {
    const { id } = ctx.params as GetAdminPermissions.Request['params'];

    const apiTokenService = getService('api-token');
    const permissionService = getService('permission');

    const token = await apiTokenService.getById(id);

    if (!token) {
      return ctx.notFound('apiToken.notFound');
    }

    // Validate ownership
    if (!canAccessToken(ctx.state.user, token)) {
      return ctx.forbidden();
    }

    const permissions = await permissionService.findMany({
      where: { apiToken: { id: token.id } },
    });

    const sanitizedPermissions = permissions.map(permissionService.sanitizePermission);

    // @ts-expect-error - transform response type to sanitized permission
    ctx.body = { data: sanitizedPermissions } satisfies GetAdminPermissions.Response;
  },

  async updateAdminPermissions(ctx: Context) {
    const { id } = ctx.params as UpdateAdminPermissions.Request['params'];
    const { body: input } = ctx.request as Omit<UpdateAdminPermissions.Request, 'params'>;

    const apiTokenService = getService('api-token');
    const permissionService = getService('permission');

    const token = await apiTokenService.getById(id);

    if (!token) {
      return ctx.notFound('apiToken.notFound');
    }

    // Validate ownership
    if (!canUpdateToken(ctx.state.user, token)) {
      return ctx.forbidden();
    }

    await validatedUpdatePermissionsInput(input);

    // Add default actionParameters to permissions (contract omits this but service needs it)
    const permissionsWithDefaults = input.permissions.map((perm: any) => ({
      ...perm,
      actionParameters: {},
    }));

    const permissions = await apiTokenService.assignAdminPermissionsToToken(
      token.id,
      permissionsWithDefaults as any,
      ctx.state.user
    );

    const sanitizedPermissions = permissions.map(permissionService.sanitizePermission);

    // @ts-expect-error - transform response type to sanitized permission
    ctx.body = { data: sanitizedPermissions } satisfies UpdateAdminPermissions.Response;
  },
};
