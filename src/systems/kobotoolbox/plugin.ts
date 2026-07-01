import type { MockSystemPlugin } from '../types.js';
import { seed } from './seed.js';

// STUB: minimal valid plugin so the registry + build compile. The kobotoolbox
// system agent will overwrite this file (and ./seed.ts and specs/kobotoolbox.schema.json).
const plugin: MockSystemPlugin = {
  name: 'kobotoolbox',
  defaultPort: 4016,
  specFile: 'kobotoolbox.schema.json',
  async overrides() {
    /* TODO: implemented by the kobotoolbox system agent */
  },
  seed,
};

export default plugin;
