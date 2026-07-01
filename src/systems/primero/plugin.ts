import type { MockSystemPlugin } from '../types.js';
import { seed } from './seed.js';

// STUB: minimal valid plugin so the registry + build compile. The primero
// system agent will overwrite this file (and ./seed.ts and specs/primero.schema.json).
const plugin: MockSystemPlugin = {
  name: 'primero',
  defaultPort: 4017,
  specFile: 'primero.schema.json',
  async overrides() {
    /* TODO: implemented by the primero system agent */
  },
  seed,
};

export default plugin;
