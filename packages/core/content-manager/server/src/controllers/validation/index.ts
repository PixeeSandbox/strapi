import _ from 'lodash';
import { z } from 'zod';
import { Schema, UID } from '@strapi/types';
import { validateZod, errors } from '@strapi/utils';
import createModelConfigurationSchema from './model-configuration';

const { PaginationError, ValidationError } = errors;
const TYPES = ['singleType', 'collectionType'] as const;

// Zod schema for Strapi IDs (string or non-negative integer)
const strapiIDSchema = z.union([z.string(), z.number().int().nonnegative()]);

/**
 * Validates type kind
 */
const kindSchema = z.enum(TYPES).nullable();

const bulkActionInputSchema = z.object({
  documentIds: z.array(strapiIDSchema).min(1),
});

const generateUIDInputSchema = z.object({
  contentTypeUID: z.string(),
  field: z.string(),
  data: z.object({}).passthrough(),
});

const checkUIDAvailabilityInputSchema = (options?: { regex?: string }) =>
  z.object({
    contentTypeUID: z.string(),
    field: z.string(),
    value: z.string().refine(
      (value) => {
        if (value === '') return true;
        const regex = options?.regex ? new RegExp(options.regex) : /^[A-Za-z0-9-_.~]*$/;
        return regex.test(value);
      },
      {
        message: 'value must match the custom regex or the default one "/^[A-Za-z0-9-_.~]*$/"',
      }
    ),
  });

const validateUIDField = (contentTypeUID: any, field: any) => {
  const model = strapi.contentTypes[contentTypeUID];

  if (!model) {
    throw new ValidationError('ContentType not found');
  }

  if (
    !_.has(model, ['attributes', field]) ||
    _.get(model, ['attributes', field, 'type']) !== 'uid'
  ) {
    throw new ValidationError(`${field} must be a valid \`uid\` attribute`);
  }
};

const validatePagination = ({ page, pageSize }: any) => {
  const pageNumber = parseInt(page, 10);
  const pageSizeNumber = parseInt(pageSize, 10);

  if (Number.isNaN(pageNumber) || pageNumber < 1) {
    throw new PaginationError('invalid pageNumber param');
  }
  if (Number.isNaN(pageSizeNumber) || pageSizeNumber < 1) {
    throw new PaginationError('invalid pageSize param');
  }
};

const validateKind = validateZod(kindSchema);
const validateBulkActionInput = validateZod(bulkActionInputSchema);
const validateGenerateUIDInput = validateZod(generateUIDInputSchema);
const validateCheckUIDAvailabilityInput = (body: {
  contentTypeUID: UID.ContentType;
  field: string;
  value: string;
}) => {
  let regex: string | undefined;

  const contentType =
    body.contentTypeUID in strapi.contentTypes ? strapi.contentTypes[body.contentTypeUID] : null;

  if (
    contentType?.attributes[body.field] &&
    `regex` in contentType.attributes[body.field] &&
    (contentType.attributes[body.field] as Schema.Attribute.UID).regex
  ) {
    regex = (contentType?.attributes[body.field] as Schema.Attribute.UID).regex;
  }

  const validator = validateZod(checkUIDAvailabilityInputSchema({ regex }));

  return validator(body);
};

export {
  createModelConfigurationSchema,
  validateUIDField,
  validatePagination,
  validateKind,
  validateBulkActionInput,
  validateGenerateUIDInput,
  validateCheckUIDAvailabilityInput,
};
