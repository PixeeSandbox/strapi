import { errors } from '@strapi/utils';
import { omit } from 'lodash/fp';
// @ts-expect-error - types are not generated for this file
// eslint-disable-next-line import/no-relative-packages
import createContext from '../../../../../../../tests/helpers/create-context';
import constants from '../../services/constants';
import apiTokenController from '../api-token';

describe('API Token Controller', () => {
  describe('Create API Token', () => {
    const body = {
      name: 'api-token_tests-name',
      description: 'api-token_tests-description',
      type: 'read-only',
    };

    test('Fails if API Token already exists', async () => {
      const exists = jest.fn(() => true);
      const ctx = createContext({ body });

      global.strapi = {
        contentAPI: {
          permissions: {
            providers: {
              action: {
                keys() {
                  return ['foo', 'bar'];
                },
              },
            },
          },
        },
        admin: {
          services: {
            'api-token': {
              exists,
            },
          },
        },
      } as any;

      expect.assertions(3);

      try {
        await apiTokenController.create(ctx as any);
      } catch (e: any) {
        expect(e instanceof errors.ApplicationError).toBe(true);
        expect(e.message).toEqual('Name already taken');
      }

      expect(exists).toHaveBeenCalledWith({ name: body.name });
    });

    test('Create API Token Successfully', async () => {
      const create = jest.fn().mockResolvedValue(body);
      const exists = jest.fn(() => false);
      const badRequest = jest.fn();
      const created = jest.fn();
      const callingUser = { id: 1, roles: [{ code: 'strapi-super-admin' }] };
      const ctx = createContext({ body }, { badRequest, created, state: { user: callingUser } });

      global.strapi = {
        admin: {
          services: {
            'api-token': {
              exists,
              create,
            },
          },
        },
      } as any;

      await apiTokenController.create(ctx as any);

      expect(exists).toHaveBeenCalledWith({ name: body.name });
      expect(badRequest).not.toHaveBeenCalled();
      expect(create).toHaveBeenCalledWith(body, callingUser);
      expect(created).toHaveBeenCalled();
    });

    test('Create API Token with valid lifespan', async () => {
      const lifespan = constants.API_TOKEN_LIFESPANS.DAYS_7;
      const createBody = {
        ...body,
        lifespan,
      };
      const tokenBody = {
        ...createBody,
        expiresAt: Date.now() + lifespan,
        permissions: undefined,
      };

      const create = jest.fn().mockResolvedValue(tokenBody);
      const exists = jest.fn(() => false);
      const badRequest = jest.fn();
      const created = jest.fn();
      const callingUser = { id: 1, roles: [{ code: 'strapi-super-admin' }] };
      const ctx = createContext({ body: createBody }, { badRequest, created, state: { user: callingUser } });

      global.strapi = {
        admin: {
          services: {
            'api-token': {
              exists,
              create,
            },
          },
        },
      } as any;

      await apiTokenController.create(ctx as any);

      expect(exists).toHaveBeenCalledWith({ name: tokenBody.name });
      expect(badRequest).not.toHaveBeenCalled();
      expect(create).toHaveBeenCalledWith(createBody, callingUser);
      expect(created).toHaveBeenCalledWith({ data: tokenBody });
    });

    test('Throws with invalid lifespan', async () => {
      const lifespan = 1235; // not in constants.API_TOKEN_LIFESPANS
      const createBody = {
        ...body,
        lifespan,
      };

      const create = jest.fn();
      const created = jest.fn();
      const ctx = createContext({ body: createBody }, { created });

      global.strapi = {
        admin: {
          services: {
            'api-token': {
              create,
            },
          },
        },
      } as any;

      expect(async () => {
        await apiTokenController.create(ctx as any);
      }).rejects.toThrow(/lifespan must be one of the following values/);
      expect(create).not.toHaveBeenCalled();
      expect(created).not.toHaveBeenCalled();
    });

    test('Throws with negative lifespan', async () => {
      const lifespan = -1;
      const createBody = {
        ...body,
        lifespan,
      };

      const create = jest.fn();
      const created = jest.fn();
      const ctx = createContext({ body: createBody }, { created });

      global.strapi = {
        admin: {
          services: {
            'api-token': {
              create,
            },
          },
        },
      } as any;

      expect(async () => {
        await apiTokenController.create(ctx as any);
      }).rejects.toThrow(/lifespan must be one of the following values/);
      expect(create).not.toHaveBeenCalled();
      expect(created).not.toHaveBeenCalled();
    });

    test('Ignores a received expiresAt', async () => {
      const lifespan = constants.API_TOKEN_LIFESPANS.DAYS_7;

      const createBody = {
        ...body,
        expiresAt: 1234,
        lifespan,
      };
      const tokenBody = {
        ...createBody,
        expiresAt: Date.now() + lifespan,
        permissions: undefined,
      };

      const create = jest.fn().mockResolvedValue(tokenBody);
      const exists = jest.fn(() => false);
      const badRequest = jest.fn();
      const created = jest.fn();
      const callingUser = { id: 1, roles: [{ code: 'strapi-super-admin' }] };
      const ctx = createContext({ body: createBody }, { badRequest, created, state: { user: callingUser } });

      global.strapi = {
        admin: {
          services: {
            'api-token': {
              exists,
              create,
            },
          },
        },
      } as any;

      await apiTokenController.create(ctx as any);

      expect(exists).toHaveBeenCalledWith({ name: tokenBody.name });
      expect(badRequest).not.toHaveBeenCalled();
      expect(create).toHaveBeenCalledWith(omit(['expiresAt'], createBody), callingUser);
      expect(created).toHaveBeenCalledWith({ data: tokenBody });
    });
  });

  describe('List API tokens', () => {
    const tokens = [
      {
        id: 1,
        name: 'api-token_tests-name',
        description: 'api-token_tests-description',
        type: 'read-only',
      },
      {
        id: 2,
        name: 'api-token_tests-name-2',
        description: 'api-token_tests-description-2',
        type: 'full-access',
      },
    ];

    test('List API tokens successfully', async () => {
      const list = jest.fn().mockResolvedValue(tokens);
      const send = jest.fn();
      const ctx = createContext({}, { send });

      global.strapi = {
        admin: {
          services: {
            'api-token': {
              list,
            },
          },
        },
      } as any;

      await apiTokenController.list(ctx as any);

      expect(list).toHaveBeenCalled();
      expect(send).toHaveBeenCalledWith({ data: tokens });
    });
  });

  describe('Delete an API token', () => {
    const token = {
      id: 1,
      name: 'api-token_tests-name',
      description: 'api-token_tests-description',
      type: 'read-only',
    };

    test('Deletes an API token successfully', async () => {
      const revoke = jest.fn().mockResolvedValue(token);
      const deleted = jest.fn();
      const ctx = createContext({ params: { id: token.id } }, { deleted });

      global.strapi = {
        admin: {
          services: {
            'api-token': {
              revoke,
            },
          },
        },
      } as any;

      await apiTokenController.revoke(ctx as any);

      expect(revoke).toHaveBeenCalledWith(token.id);
      expect(deleted).toHaveBeenCalledWith({ data: token });
    });

    test('Does not return an error if the resource does not exists', async () => {
      const revoke = jest.fn().mockResolvedValue(null);
      const deleted = jest.fn();
      const ctx = createContext({ params: { id: token.id } }, { deleted });

      global.strapi = {
        admin: {
          services: {
            'api-token': {
              revoke,
            },
          },
        },
      } as any;

      await apiTokenController.revoke(ctx as any);

      expect(revoke).toHaveBeenCalledWith(token.id);
      expect(deleted).toHaveBeenCalledWith({ data: null });
    });
  });

  describe('Regenerate an API token', () => {
    const token = {
      id: 1,
      name: 'api-token_tests-regenerate',
      description: 'api-token_tests-description',
      type: 'read-only',
    };

    const ownerUser = { id: 42, roles: [{ code: 'strapi-editor' }] };
    const superAdmin = { id: 99, roles: [{ code: 'strapi-super-admin' }] };

    test('Regenerates an ownerless (legacy) token successfully', async () => {
      const regenerate = jest.fn().mockResolvedValue(token);
      const getById = jest.fn().mockResolvedValue(token); // no adminUserOwner
      const created = jest.fn();
      const ctx = createContext({ params: { id: token.id } }, { created, state: { user: superAdmin } });

      global.strapi = {
        admin: {
          services: {
            'api-token': {
              regenerate,
              getById,
            },
          },
        },
      } as any;

      await apiTokenController.regenerate(ctx as any);

      expect(regenerate).toHaveBeenCalledWith(token.id);
    });

    test('Regenerates an owned token when caller is the owner', async () => {
      const ownedToken = { ...token, adminUserOwner: ownerUser.id };
      const regenerate = jest.fn().mockResolvedValue({ ...ownedToken, accessKey: 'new-key' });
      const getById = jest.fn().mockResolvedValue(ownedToken);
      const created = jest.fn();
      const ctx = createContext({ params: { id: token.id } }, { created, state: { user: ownerUser } });

      global.strapi = {
        admin: {
          services: {
            'api-token': {
              regenerate,
              getById,
            },
          },
        },
      } as any;

      await apiTokenController.regenerate(ctx as any);

      expect(regenerate).toHaveBeenCalledWith(token.id);
    });

    test('Forbids regenerate when caller is not the owner', async () => {
      const otherUser = { id: 55, roles: [{ code: 'strapi-editor' }] };
      const ownedToken = { ...token, adminUserOwner: ownerUser.id };
      const regenerate = jest.fn();
      const getById = jest.fn().mockResolvedValue(ownedToken);
      const created = jest.fn();
      const forbidden = jest.fn();
      const ctx = createContext({ params: { id: token.id } }, { created, forbidden, state: { user: otherUser } });

      global.strapi = {
        admin: {
          services: {
            'api-token': {
              regenerate,
              getById,
            },
          },
        },
      } as any;

      await apiTokenController.regenerate(ctx as any);

      expect(forbidden).toHaveBeenCalled();
      expect(regenerate).not.toHaveBeenCalled();
    });

    test('Forbids regenerate when super admin tries to regenerate another user\'s token', async () => {
      const ownedToken = { ...token, adminUserOwner: ownerUser.id };
      const regenerate = jest.fn();
      const getById = jest.fn().mockResolvedValue(ownedToken);
      const created = jest.fn();
      const forbidden = jest.fn();
      const ctx = createContext({ params: { id: token.id } }, { created, forbidden, state: { user: superAdmin } });

      global.strapi = {
        admin: {
          services: {
            'api-token': {
              regenerate,
              getById,
            },
          },
        },
      } as any;

      await apiTokenController.regenerate(ctx as any);

      expect(forbidden).toHaveBeenCalled();
      expect(regenerate).not.toHaveBeenCalled();
    });

    test('Fails if token not found', async () => {
      const regenerate = jest.fn().mockResolvedValue(token);
      const getById = jest.fn().mockResolvedValue(null);
      const created = jest.fn();
      const notFound = jest.fn();
      const ctx = createContext({ params: { id: token.id } }, { created, notFound, state: { user: superAdmin } });

      global.strapi = {
        admin: {
          services: {
            'api-token': {
              regenerate,
              getById,
            },
          },
        },
      } as any;

      await apiTokenController.regenerate(ctx as any);

      expect(regenerate).not.toHaveBeenCalled();
      expect(getById).toHaveBeenCalledWith(token.id);
      expect(notFound).toHaveBeenCalledWith('API Token not found');
    });
  });

  describe('Retrieve an API token', () => {
    const token = {
      id: 1,
      name: 'api-token_tests-name',
      description: 'api-token_tests-description',
      type: 'read-only',
    };

    const ownerUser = { id: 42, roles: [{ code: 'strapi-editor' }] };
    const superAdmin = { id: 99, roles: [{ code: 'strapi-super-admin' }] };

    test('Retrieve an ownerless (legacy) token includes accessKey for any caller', async () => {
      const tokenWithKey = { ...token, accessKey: 'plaintext-key' };
      // first call (no key), second call (with key)
      const getById = jest.fn()
        .mockResolvedValueOnce(token)
        .mockResolvedValueOnce(tokenWithKey);
      const send = jest.fn();
      const ctx = createContext({ params: { id: token.id } }, { send, state: { user: superAdmin } });

      global.strapi = {
        admin: {
          services: {
            'api-token': {
              getById,
            },
          },
        },
      } as any;

      await apiTokenController.get(ctx as any);

      expect(getById).toHaveBeenCalledTimes(2);
      expect(send).toHaveBeenCalledWith({ data: tokenWithKey });
    });

    test('Retrieve an owned token returns accessKey only for the owner', async () => {
      const ownedToken = { ...token, adminUserOwner: ownerUser.id };
      const ownedTokenWithKey = { ...ownedToken, accessKey: 'plaintext-key' };
      const getById = jest.fn()
        .mockResolvedValueOnce(ownedToken)
        .mockResolvedValueOnce(ownedTokenWithKey);
      const send = jest.fn();
      const ctx = createContext({ params: { id: token.id } }, { send, state: { user: ownerUser } });

      global.strapi = {
        admin: {
          services: {
            'api-token': {
              getById,
            },
          },
        },
      } as any;

      await apiTokenController.get(ctx as any);

      expect(getById).toHaveBeenCalledTimes(2);
      expect(send).toHaveBeenCalledWith({ data: ownedTokenWithKey });
    });

    test('Retrieve an owned token does NOT return accessKey for super admin', async () => {
      const ownedToken = { ...token, adminUserOwner: ownerUser.id };
      const getById = jest.fn().mockResolvedValue(ownedToken);
      const send = jest.fn();
      const ctx = createContext({ params: { id: token.id } }, { send, state: { user: superAdmin } });

      global.strapi = {
        admin: {
          services: {
            'api-token': {
              getById,
            },
          },
        },
      } as any;

      await apiTokenController.get(ctx as any);

      // Only one call — no second fetch for the key
      expect(getById).toHaveBeenCalledTimes(1);
      const sentData = send.mock.calls[0][0].data;
      expect(sentData.accessKey).toBeUndefined();
    });

    test('Fails if the API token does not exist', async () => {
      const getById = jest.fn().mockResolvedValue(null);
      const notFound = jest.fn();
      const ctx = createContext({ params: { id: token.id } }, { notFound, state: { user: superAdmin } });

      global.strapi = {
        admin: {
          services: {
            'api-token': {
              getById,
            },
          },
        },
      } as any;

      await apiTokenController.get(ctx as any);

      expect(getById).toHaveBeenCalledWith(token.id);
      expect(notFound).toHaveBeenCalledWith('API Token not found');
    });
  });

  describe('Update API Token', () => {
    const body = {
      name: 'api-token_tests-name',
      description: 'api-token_tests-description',
      type: 'read-only',
    };

    const id = 1;

    test('Fails if the name is already taken', async () => {
      const getById = jest.fn(() => ({ id, ...body }));
      const getByName = jest.fn(() => ({ id: 2, name: body.name }));
      const ctx = createContext({ body, params: { id } });

      global.strapi = {
        admin: {
          services: {
            'api-token': {
              getById,
              getByName,
            },
          },
        },
      } as any;

      expect.assertions(3);

      try {
        await apiTokenController.update(ctx as any);
      } catch (e: any) {
        expect(e instanceof errors.ApplicationError).toBe(true);
        expect(e.message).toEqual('Name already taken');
      }

      expect(getByName).toHaveBeenCalledWith(body.name);
    });

    test('Fails if the token does not exist', async () => {
      const getById = jest.fn(() => null);
      const notFound = jest.fn();
      const ctx = createContext({ body, params: { id } }, { notFound });

      global.strapi = {
        admin: {
          services: {
            'api-token': {
              getById,
            },
          },
        },
      } as any;

      await apiTokenController.update(ctx as any);

      expect(getById).toHaveBeenCalledWith(id);
      expect(notFound).toHaveBeenCalledWith('API Token not found');
    });

    test('Updates API Token Successfully', async () => {
      const update = jest.fn().mockResolvedValue(body);
      const getById = jest.fn(() => ({ id, ...body }));
      const getByName = jest.fn(() => null);
      const notFound = jest.fn();
      const send = jest.fn();
      const callingUser = { id: 1, roles: [{ code: 'strapi-super-admin' }] };
      const ctx = createContext({ body, params: { id } }, { notFound, send, state: { user: callingUser } });

      global.strapi = {
        admin: {
          services: {
            'api-token': {
              getById,
              getByName,
              update,
            },
          },
        },
      } as any;

      await apiTokenController.update(ctx as any);

      expect(getById).toHaveBeenCalledWith(id);
      expect(getByName).toHaveBeenCalledWith(body.name);
      expect(notFound).not.toHaveBeenCalled();
      expect(update).toHaveBeenCalledWith(id, body, callingUser);
      expect(send).toHaveBeenCalled();
    });
  });
});
