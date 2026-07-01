import type { MockSystemPlugin } from '../types.js';
import { seed } from './seed.js';

// STUB: minimal valid plugin so the registry + build compile. The airtable
// system agent will overwrite this file (and ./seed.ts and specs/airtable.schema.json).
const plugin: MockSystemPlugin = {
  name: 'airtable',
  defaultPort: 4020,
  specFile: 'airtable.schema.json',
  async overrides() {
    /* TODO: implemented by the airtable system agent */
  },
  seed,
};

export default plugin;
