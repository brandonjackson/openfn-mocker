import type { MockSystemPlugin } from '../types.js';
import { seed } from './seed.js';

// STUB: minimal valid plugin so the registry + build compile. The twilio
// system agent will overwrite this file (and ./seed.ts and specs/twilio.openapi.json).
const plugin: MockSystemPlugin = {
  name: 'twilio',
  defaultPort: 4019,
  specFile: 'twilio.openapi.json',
  async overrides() {
    /* TODO: implemented by the twilio system agent */
  },
  seed,
};

export default plugin;
