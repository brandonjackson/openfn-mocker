import type { MockSystemPlugin } from '../types.js';
import { seed } from './seed.js';

// STUB: minimal valid plugin so the registry + build compile. The openmrs
// system agent will overwrite this file (and ./seed.ts and specs/openmrs.schema.json).
const plugin: MockSystemPlugin = {
  name: 'openmrs',
  defaultPort: 4012,
  specFile: 'openmrs.schema.json',
  async overrides() {
    /* TODO: implemented by the openmrs system agent */
  },
  seed,
};

export default plugin;
