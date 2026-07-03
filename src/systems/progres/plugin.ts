import { randomInt, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { seed } from './seed.js';
import { usage } from './usage.js';
import { guide } from './guide.js';

/**
 * UNHCR proGres v4 (refugee registration & case management). The progres adaptor
 * exposes a single operation, `postData({ url, body, headers, agentOptions })` — a
 * generic mutual-TLS POST (client cert + private key in agentOptions, bearer token
 * in headers). The mock only presence-checks auth, so these are a couple of
 * representative proGres v4 REST endpoints a postData job can target with a
 * relative `url`.
 */

/** proGres global distinct id. */
function genProgresId(): string {
  return String(randomInt(100_000_000, 999_999_999));
}

/** Build a stored individual from a registration body. */
function toIndividual(body: Record<string, any>): Record<string, any> {
  return {
    progresId: genProgresId(),
    individualGuid: randomUUID(),
    givenName: body.givenName ?? body.firstName ?? '',
    familyName: body.familyName ?? body.lastName ?? '',
    dateOfBirth: body.dateOfBirth ?? null,
    sex: body.sex ?? null,
    countryOfOrigin: body.countryOfOrigin ?? null,
    status: 'REGISTERED',
    registeredAt: new Date().toISOString(),
  };
}

const plugin: MockSystemPlugin = {
  name: 'progres',
  credential: {
    type: 'apikey',
    // The url field is literally named `url` (proGres configuration-schema).
    fields: [
      { name: 'url', role: 'url' },
      { name: 'key', role: 'secret', secret: { charset: 'hex', length: 32 } },
      { name: 'cert', role: 'secret', secret: { charset: 'hex', length: 64 } },
      { name: 'token', role: 'secret', secret: { charset: 'hex', length: 40 } },
    ],
  },

  usage,
  guide,

  async overrides(app: FastifyInstance, store: DataStore, _config: SystemConfig) {
    // POST /api/v4/individuals — register an individual (postData target).
    app.post('/api/v4/individuals', async (req, reply) => {
      const ind = toIndividual((req.body ?? {}) as Record<string, any>);
      store.create('individuals', ind.progresId, ind);
      reply.code(201);
      return ind;
    });

    // GET /api/v4/individuals — list registered individuals.
    app.get('/api/v4/individuals', async () => ({
      totalCount: store.count('individuals'),
      results: store.list('individuals'),
    }));

    // GET /api/v4/individuals/:progresId — fetch one by proGres ID.
    app.get('/api/v4/individuals/:progresId', async (req, reply) => {
      const id = String((req.params as Record<string, any>).progresId);
      const found = store.get('individuals', id);
      if (!found) {
        reply.code(404);
        return { error: 'NotFound', message: `No individual with progresId ${id}` };
      }
      return found;
    });
  },

  seed,
};

export default plugin;
