import { z } from 'zod';
import { validateZod } from '@strapi/utils';

const historyRestoreVersionSchema = z.object({
  contentType: z.string().trim().min(1),
});

export const validateRestoreVersion = validateZod(historyRestoreVersionSchema);
