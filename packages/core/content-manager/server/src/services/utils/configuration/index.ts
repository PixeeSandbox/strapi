import { createModelConfigurationSchema } from '../../../controllers/validation';
import { createDefaultSettings, syncSettings } from './settings';
import { createDefaultMetadatas, syncMetadatas } from './metadatas';
import { createDefaultLayouts, syncLayouts } from './layouts';

async function validateCustomConfig(schema: any) {
  try {
    await createModelConfigurationSchema(schema, {
      allowUndefined: true,
    }).parseAsync(schema.config);
  } catch (error: any) {
    const message = error.message || error.issues?.[0]?.message || 'Unknown validation error';
    throw new Error(
      `Invalid Model configuration for model ${schema.uid}. Verify your {{ modelName }}.config.js(on) file:\n  - ${message}\n`
    );
  }
}

async function createDefaultConfiguration(schema: any) {
  await validateCustomConfig(schema);

  return {
    settings: await createDefaultSettings(schema),
    metadatas: await createDefaultMetadatas(schema),
    layouts: await createDefaultLayouts(schema),
  };
}

async function syncConfiguration(conf: any, schema: any) {
  await validateCustomConfig(schema);

  return {
    settings: await syncSettings(conf, schema),
    layouts: await syncLayouts(conf, schema),
    metadatas: await syncMetadatas(conf, schema),
  };
}

export { createDefaultConfiguration, syncConfiguration };
