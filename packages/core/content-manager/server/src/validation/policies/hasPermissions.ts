import { z } from 'zod';

const hasPermissionsSchema = z.object({
  actions: z.array(z.string()).optional(),
  hasAtLeastOne: z.boolean().optional(),
});

export const validateHasPermissionsInput = (data: unknown) => {
  return hasPermissionsSchema.parse(data);
};
