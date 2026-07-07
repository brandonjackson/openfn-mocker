import type { FastifyInstance } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { seed } from './seed.js';
import { usage } from './usage.js';
import { guide } from './guide.js';

/**
 * Google Generative Language API / Gemini (generativelanguage.googleapis.com).
 * The gemini adaptor authenticates with an API key in the `?key=` query param
 * (not a header), so this system does NOT declare `auth.required` — otherwise the
 * mock would 401 the adaptor's header-less requests.
 *
 * The model + verb are packed into one path segment, e.g.
 * `gemini-2.0-flash:generateContent` or `imagen-3.0-generate-002:predict`. Fastify
 * only starts a named param at the START of a segment, so the whole segment binds
 * to `:model` and we branch on its contents:
 *   - image generation (`predict` / `imagen`) -> a predictions envelope
 *   - everything else (generateContent)       -> a candidates envelope
 */

const plugin: MockSystemPlugin = {
  name: 'gemini',
  credential: {
    type: 'apikey',
    fields: [
      { name: 'baseUrl', role: 'url' },
      { name: 'apiKey', role: 'secret', secret: { charset: 'alnum', length: 39, prefix: 'AIza' } },
    ],
  },
  // The @google/genai client hardcodes generativelanguage.googleapis.com (no
  // configurable base URL — the `baseUrl` field above is inert), so
  // `pnpm test:usage` aliases that host to the mock. See src/systems/types.ts
  // `hostAliases` and the README's "Local network aliasing".
  hostAliases: ['generativelanguage.googleapis.com'],

  usage,
  guide,

  async overrides(app: FastifyInstance, _store: DataStore, _config: SystemConfig) {
    // POST /v1beta/models/:model — the whole `model:verb` segment binds to :model.
    app.post('/v1beta/models/:model', async (req) => {
      const model = String((req.params as Record<string, any>).model);

      // Image generation: imagen models / the :predict verb.
      if (model.includes('predict') || model.includes('imagen') || model.includes('generateImage')) {
        return {
          predictions: [{ bytesBase64Encoded: 'aGVsbG8=', mimeType: 'image/png' }],
        };
      }

      // Text generation (generateContent).
      return {
        candidates: [
          {
            content: {
              parts: [{ text: 'This is a mock Gemini response.' }],
              role: 'model',
            },
            finishReason: 'STOP',
            index: 0,
          },
        ],
        usageMetadata: {
          promptTokenCount: 8,
          candidatesTokenCount: 7,
          totalTokenCount: 15,
        },
      };
    });
  },

  seed,
};

export default plugin;
