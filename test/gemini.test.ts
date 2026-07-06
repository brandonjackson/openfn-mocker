import { describe, it, expect } from 'vitest';
import { createSystemServer } from '../src/server.js';
import gemini from '../src/systems/gemini/plugin.js';

const config = { port: 0 };

describe('gemini', () => {
  it('generates content (candidates envelope)', async () => {
    const { app } = await createSystemServer(gemini, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/v1beta/models/gemini-2.0-flash:generateContent',
      payload: { contents: [{ parts: [{ text: 'Hello' }] }] },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.candidates[0].content.parts[0].text).toBe('This is a mock Gemini response.');
    expect(body.candidates[0].content.role).toBe('model');
    await app.close();
  });

  it('returns usage metadata', async () => {
    const { app } = await createSystemServer(gemini, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/v1beta/models/gemini-2.0-flash:generateContent',
      payload: { contents: [{ parts: [{ text: 'Hello' }] }] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().usageMetadata.totalTokenCount).toBe(15);
    await app.close();
  });

  it('generates an image (predictions envelope)', async () => {
    const { app } = await createSystemServer(gemini, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/v1beta/models/imagen-3.0-generate-002:predict',
      payload: { instances: [{ prompt: 'A red bicycle' }] },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.predictions)).toBe(true);
    expect(body.predictions[0].mimeType).toBe('image/png');
    await app.close();
  });
});
