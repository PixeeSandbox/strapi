import { z } from 'zod';
import { getService } from '../../utils';
import { isListable, hasEditableAttribute } from '../../services/utils/configuration/attributes';
import { isValidDefaultSort } from '../../services/utils/configuration/settings';

/**
 * Creates the validation schema for content-type configurations
 */
export default (schema: any, opts = {}) => {
  const settingsSchema = createSettingsSchema(schema);
  const metadasSchema = createMetadasSchema(schema);
  const layoutsSchema = createLayoutsSchema(schema, opts);

  return z
    .object({
      settings: settingsSchema.nullable().default(null).optional(),
      metadatas: metadasSchema.nullable().default(null).optional(),
      layouts: layoutsSchema.nullable().default(null).optional(),
      options: z.object({}).passthrough().optional(),
    })
    .strict();
};

const createSettingsSchema = (schema: any) => {
  const validAttributes = Object.keys(schema.attributes).filter((key) => isListable(schema, key));

  return z
    .object({
      bulkable: z.boolean(),
      filterable: z.boolean(),
      pageSize: z.number().int().min(10).max(100),
      searchable: z.boolean(),
      // should be reset when the type changes
      mainField: z
        .enum(['id', ...validAttributes] as [string, ...string[]])
        .default('id')
        .optional(),
      // should be reset when the type changes
      defaultSortBy: z
        .string()
        .refine((value) => isValidDefaultSort(schema, value), {
          message: 'is not a valid sort attribute',
        })
        .default('id')
        .optional(),
      defaultSortOrder: z.enum(['ASC', 'DESC']).default('ASC').optional(),
    })
    .strict();
};

const createMetadasSchema = (schema: any) => {
  const metadataShape: Record<string, z.ZodTypeAny> = {};

  Object.keys(schema.attributes).forEach((key) => {
    // For mainField validation, we use a function that validates at parse time
    // This mimics yup.lazy() behavior where the service is only called when needed
    const createMainFieldValidator = () => {
      return z
        .string()
        .optional()
        .superRefine((value, ctx) => {
          // If no value provided, it's valid (optional field)
          if (!value) {
            return;
          }

          // Only validate against valid attributes if we can get the target schema
          try {
            const targetSchema = getService('content-types').findContentType(
              schema.attributes[key].targetModel
            );

            if (!targetSchema) {
              // No target schema found, accept any string
              return;
            }

            const validAttributes = Object.keys(targetSchema.attributes).filter((attr) =>
              isListable(targetSchema, attr)
            );

            const allowedValues = [...validAttributes, 'id'];

            if (!allowedValues.includes(value)) {
              ctx.addIssue({
                code: z.ZodIssueCode.invalid_enum_value,
                options: allowedValues,
                received: value,
                message: `Invalid mainField value. Expected one of: ${allowedValues.join(', ')}`,
              });
            }
          } catch {
            // If service is not available (e.g., in tests), accept any string
            return;
          }
        });
    };

    // Custom schema that coerces primitives to string but rejects arrays/objects
    const coercibleString = z.preprocess((val) => {
      if (val === null || val === undefined) return val;
      if (Array.isArray(val) || (typeof val === 'object' && val !== null)) {
        return val; // Let it fail validation as non-string
      }
      return String(val);
    }, z.string().nullable().optional());

    metadataShape[key] = z
      .object({
        edit: z
          .object({
            label: z.string().optional(),
            description: coercibleString,
            placeholder: coercibleString,
            editable: z.boolean().optional(),
            visible: z.boolean().optional(),
            mainField: createMainFieldValidator(),
          })
          .strict()
          .optional(),
        list: z
          .object({
            label: z.string().optional(),
            searchable: z.boolean().optional(),
            sortable: z.boolean().optional(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional();
  });

  return z.object(metadataShape);
};

const createArrayTest =
  ({ allowUndefined = false } = {}) =>
  (val: unknown) =>
    allowUndefined === true && val === undefined ? true : Array.isArray(val);

const createLayoutsSchema = (schema: any, opts: { allowUndefined?: boolean } = {}) => {
  const validAttributes = Object.keys(schema.attributes).filter((key) => isListable(schema, key));

  const editAttributes = Object.keys(schema.attributes).filter((key) =>
    hasEditableAttribute(schema, key)
  );

  const editItemSchema = z
    .object({
      name: z.enum(editAttributes as [string, ...string[]]),
      size: z.number().int().positive(),
    })
    .strict();

  const editRowSchema = z.array(editItemSchema);
  const editSchema = z.array(editRowSchema);

  const listItemSchema =
    validAttributes.length > 0
      ? z.enum(validAttributes as [string, ...string[]])
      : z.string().refine(() => false, { message: 'No valid attributes available' });
  const listSchema = z.array(listItemSchema);

  return z.object({
    edit: editSchema.refine(createArrayTest(opts), {
      message: 'edit is required and must be an array',
    }),
    list: listSchema.refine(createArrayTest(opts), {
      message: 'list is required and must be an array',
    }),
  });
};
