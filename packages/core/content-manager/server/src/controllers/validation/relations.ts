import { z } from 'zod';
import { validateZod } from '@strapi/utils';

// Zod schema for Strapi IDs (string or non-negative integer)
const strapiIDSchema = z.union([z.string(), z.number().int().nonnegative()]);

const validateFindAvailableSchema = z.object({
  component: z.string().optional(),
  id: strapiIDSchema.optional(),
  _q: z.string().optional(),
  idsToOmit: z.array(strapiIDSchema).optional(),
  idsToInclude: z.array(strapiIDSchema).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  locale: z.string().nullable().optional(),
  status: z.enum(['published', 'draft']).nullable().optional(),
});

const validateFindExistingSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  locale: z.string().nullable().optional(),
  status: z.enum(['published', 'draft']).nullable().optional(),
});

const validateFindAvailable = validateZod(validateFindAvailableSchema);
const validateFindExisting = validateZod(validateFindExistingSchema);

export { validateFindAvailable, validateFindExisting };
