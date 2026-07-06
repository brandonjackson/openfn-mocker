import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';

/**
 * Gemini seed. The Generative Language API is stateless (each request generates a
 * fresh response), so there is nothing to seed — this is a no-op that keeps the
 * plugin shape consistent with the other systems.
 */
export function seed(_store: DataStore, _config: SystemConfig): void {
  // no seed data — responses are synthesised per request.
}
