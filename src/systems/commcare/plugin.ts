import type { MockSystemPlugin } from '../types.js';
import { seed } from './seed.js';

// STUB: minimal valid plugin so the registry + build compile. The commcare
// system agent will overwrite this file (and ./seed.ts and specs/commcare.schema.json).
const plugin: MockSystemPlugin = {
  name: 'commcare',
  defaultPort: 4011,
  specFile: 'commcare.schema.json',
  async overrides() {
    /* TODO: implemented by the commcare system agent */
  },
  seed,
};

export default plugin;
