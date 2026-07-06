import type { UsageExample } from '../types.js';

/**
 * Usage examples for the gemini sandbox "Usage" tab: one entry per adaptor
 * function (prompt, generateImage, deepResearch). prompt/deepResearch fire a
 * generateContent request; generateImage fires a :predict request.
 */
export const usage: UsageExample[] = [
  {
    fn: 'prompt',
    signature: 'prompt(model, text, options?)',
    description: 'Send a text prompt to a Gemini model and get a completion.',
    code: "prompt('gemini-2.0-flash', 'Summarise this text: ...');",
    apiRef: 'generate',
  },
  {
    fn: 'generateImage',
    signature: 'generateImage(model, prompt, options?)',
    description: 'Generate an image from a text prompt with an Imagen model.',
    code: "generateImage('imagen-3.0-generate-002', 'A red bicycle');",
    apiRef: 'image',
  },
  {
    fn: 'deepResearch',
    signature: 'deepResearch(model, topic, options?)',
    description: 'Run a longer research-style prompt against a Gemini model.',
    code: "deepResearch('gemini-2.0-flash', 'Research topic X');",
    apiRef: 'generate',
  },
];
