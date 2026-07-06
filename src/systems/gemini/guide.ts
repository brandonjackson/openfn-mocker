import type { SystemGuide } from '../types.js';

/**
 * Sandbox guide for the gemini system. Paths mirror the Generative Language API
 * v1beta models resource, where the model and verb share one colon-joined path
 * segment (gemini-2.0-flash:generateContent, imagen-3.0-generate-002:predict).
 * Auth is an API key in the ?key= query param, so no Authorization header.
 */
export const guide: SystemGuide = {
  title: 'Gemini',
  docs: 'https://docs.openfn.org/adaptors/packages/gemini-docs',
  blurb:
    'Google Gemini / Generative Language API. The adaptor sends an API key in the ?key= query param (no Authorization header) and POSTs to models/{model}:{verb}. Text prompts return a candidates envelope; image generation returns a predictions envelope.',
  auth: 'API key (query param)',
  examples: [
    {
      id: 'generate',
      method: 'POST',
      path: '/v1beta/models/gemini-2.0-flash:generateContent',
      label: 'Generate content from a prompt',
      body: JSON.stringify({ contents: [{ parts: [{ text: 'Hello' }] }] }, null, 2),
    },
    {
      id: 'image',
      method: 'POST',
      path: '/v1beta/models/imagen-3.0-generate-002:predict',
      label: 'Generate an image',
      body: JSON.stringify({ instances: [{ prompt: 'A red bicycle' }] }, null, 2),
    },
  ],
};
