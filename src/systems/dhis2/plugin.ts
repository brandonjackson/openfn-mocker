import type { MockSystemPlugin } from '../types.js';
import { seed } from './seed.js';

// STUB: minimal valid plugin so the registry + build compile. The dhis2
// system agent will overwrite this file (and ./seed.ts and specs/dhis2.openapi.json).
const plugin: MockSystemPlugin = {
  name: 'dhis2',
  defaultPort: 4010,
  specFile: 'dhis2.openapi.json',
  async overrides() {
    /* TODO: implemented by the dhis2 system agent */
  },
  seed,
};

export default plugin;
