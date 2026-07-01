import type { MockSystemPlugin } from '../types.js';
import { seed } from './seed.js';

// STUB: minimal valid plugin so the registry + build compile. The fhir
// system agent will overwrite this file (and ./seed.ts and specs/fhir-r4.openapi.json).
const plugin: MockSystemPlugin = {
  name: 'fhir',
  defaultPort: 4013,
  specFile: 'fhir-r4.openapi.json',
  async overrides() {
    /* TODO: implemented by the fhir system agent */
  },
  seed,
};

export default plugin;
