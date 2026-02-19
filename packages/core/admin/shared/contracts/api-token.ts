import { errors } from '@strapi/utils';
import type { Data } from '@strapi/types';
import type { Permission, AdminUser } from './shared';

export type ApiToken = {
  accessKey?: string;
  encryptedKey?: string;
  createdAt: string;
  description: string;
  expiresAt: string;
  id: Data.ID;
  lastUsedAt: string | null;
  lifespan: string | number | null;
  name: string;
  permissions: string[];
  adminPermissions?: Permission[];
  adminUserOwner?: Data.ID | AdminUser;
  type: 'custom' | 'full-access' | 'read-only';
  updatedAt: string;
};

export interface ApiTokenBody extends Pick<ApiToken, 'description' | 'name'> {
  lifespan?: ApiToken['lifespan'] | null;
  permissions?: ApiToken['permissions'] | null;
  adminPermissions?: Omit<Permission, 'id' | 'createdAt' | 'updatedAt' | 'actionParameters'>[];
  adminUserOwner?: Data.ID;
  type: ApiToken['type'] | undefined;
}

/**
 * POST /api-tokens - Create an api token
 */
export declare namespace Create {
  export interface Request {
    body: ApiTokenBody;
    query: {};
  }

  export interface Response {
    data: ApiToken;
    error?: errors.ApplicationError | errors.YupValidationError;
  }
}

/**
 * GET /api-tokens - List api tokens
 */
export declare namespace List {
  export interface Request {
    body: {};
    query: {};
  }

  export interface Response {
    data: ApiToken[];
    error?: errors.ApplicationError;
  }
}

/**
 * DELETE /api-tokens/:id - Delete an API token
 */
export declare namespace Revoke {
  export interface Request {
    body: {};
    query: {};
  }

  export interface Params {
    id: Data.ID;
  }

  export interface Response {
    data: ApiToken;
    error?: errors.ApplicationError;
  }
}

/**
 * GET /api-tokens/:id - Get an API token
 */
export declare namespace Get {
  export interface Request {
    body: {};
    query: {};
  }

  export interface Params {
    id: Data.ID;
  }

  export interface Response {
    data: ApiToken;
    error?: errors.ApplicationError;
  }
}

/**
 * POST /api-tokens/:id - Update an API token
 */
export declare namespace Update {
  export interface Request {
    body: ApiTokenBody;
    query: {};
  }

  export interface Params {
    id: Data.ID;
  }

  export interface Response {
    data: ApiToken;
    error?: errors.ApplicationError | errors.YupValidationError;
  }
}

/**
 * GET /api-tokens/:id/admin-permissions - Get admin permissions of a token
 */
export declare namespace GetAdminPermissions {
  export interface Request {
    params: { id: Data.ID };
    query: {};
    body: {};
  }

  export interface Response {
    data: Permission[];
    error?: errors.ApplicationError | errors.NotFoundError;
  }
}

/**
 * PUT /api-tokens/:id/admin-permissions - Update admin permissions
 */
export declare namespace UpdateAdminPermissions {
  export interface Request {
    params: { id: Data.ID };
    query: {};
    body: {
      permissions: Omit<Permission, 'id' | 'createdAt' | 'updatedAt' | 'actionParameters'>[];
    };
  }

  export interface Response {
    data: Permission[];
    error?: errors.ApplicationError | errors.NotFoundError | errors.YupValidationError;
  }
}
