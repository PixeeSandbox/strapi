import { z } from 'zod';
import { errors, contentTypes } from '@strapi/utils';
import type { UID } from '@strapi/types';

interface Options {
  allowMultipleLocales?: boolean;
}

const singleLocaleSchema = z.string().nullable().optional();

const multipleLocaleSchema = z.union([z.array(z.string()), z.string().nullable()]).optional();

const statusSchema = z.enum(['draft', 'published'], {
  errorMap: () => ({ message: 'Invalid status' }),
});

/**
 * From a request or query object, validates and returns the locale and status of the document.
 * If the status is not provided and Draft & Publish is disabled, it defaults to 'published'.
 */
export const getDocumentLocaleAndStatus = async (
  request: any,
  model: UID.Schema,
  opts: Options = { allowMultipleLocales: false }
) => {
  const { allowMultipleLocales } = opts;
  const { locale, status: providedStatus, ...rest } = request || {};

  const defaultStatus = contentTypes.hasDraftAndPublish(strapi.getModel(model))
    ? undefined
    : 'published';
  const status = providedStatus !== undefined ? providedStatus : defaultStatus;

  const schema = z.object({
    locale: allowMultipleLocales ? multipleLocaleSchema : singleLocaleSchema,
    status: statusSchema.optional(),
  });

  try {
    schema.parse(request);

    return { locale, status, ...rest };
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      const messages = error.issues.map((issue) => issue.message).join(', ');
      throw new errors.ValidationError(`Validation error: ${messages}`);
    }
    throw error;
  }
};
