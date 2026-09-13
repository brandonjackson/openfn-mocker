import type { FastifyInstance, FastifyReply } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { seed } from './seed.js';
import { usage } from './usage.js';
import { guide } from './guide.js';

/**
 * OpenConceptLab (OCL) — open terminology management. The ocl adaptor reads the
 * OCL REST API by path: get(path) hits <baseUrl>/<path>, and getMappings builds
 * <baseUrl>/<ownerType>/<ownerId>/<repository>/<repositoryId>/<version>/mappings
 * (defaults orgs / collections / HEAD). Real OCL uses `Authorization: Token
 * <token>` — accept-all here. List endpoints return bare JSON arrays; single
 * resources return the object.
 *
 * Credential URL field: the adaptor's configuration-schema.json names it
 * `hostUrl`, but the *compiled adaptor* actually reads `state.configuration.baseUrl`
 * (an upstream inconsistency) — so we expose `baseUrl`, which is what the adaptor
 * dereferences to reach this mock.
 */

/**
 * OCL paginates in *headers*, not in the body: its list views serialize the page
 * as a bare JSON array and hang `num_found` / `num_returned` / `pages` /
 * `page_number` off the response (`ListWithHeadersMixin` in oclapi2). `next` and
 * `previous` are only present when such a page exists, which for the seeded
 * single page is never.
 */
function listPage(reply: FastifyReply, items: any[]): any[] {
  reply.header('num_found', String(items.length));
  reply.header('num_returned', String(items.length));
  reply.header('pages', '1');
  reply.header('page_number', '1');
  return items;
}

const plugin: MockSystemPlugin = {
  name: 'ocl',
  credential: {
    type: 'userpass',
    fields: [
      { name: 'baseUrl', role: 'url' },
      { name: 'username', role: 'username', value: 'admin' },
      { name: 'password', role: 'secret', secret: { charset: 'alnum', length: 16 } },
    ],
  },

  usage,
  guide,

  async overrides(app: FastifyInstance, store: DataStore, _config: SystemConfig) {
    // --- Mappings (getMappings): both collections and sources repositories. ---
    const mappings = async (_req: unknown, reply: FastifyReply) => listPage(reply, store.list('mappings'));
    app.get('/orgs/:ownerId/collections/:repo/:version/mappings', mappings);
    app.get('/orgs/:ownerId/sources/:repo/:version/mappings', mappings);

    // --- Concepts. A versioned repo path and the plain get() path both work. ---
    const concepts = async (_req: unknown, reply: FastifyReply) => listPage(reply, store.list('concepts'));
    app.get('/orgs/:ownerId/collections/:repo/:version/concepts', concepts);
    app.get('/orgs/:ownerId/sources/:repo/concepts', concepts);

    // --- Source metadata / list ---
    app.get('/orgs/:ownerId/sources/:repo', async (req, reply) => {
      const { repo } = req.params as Record<string, any>;
      const found = store.get('sources', repo);
      if (found === undefined) {
        reply.code(404);
        return { detail: 'Not found.' };
      }
      return found;
    });
    app.get('/orgs/:ownerId/sources', async (_req, reply) => listPage(reply, store.list('sources')));

    // --- Organization metadata ---
    app.get('/orgs/:ownerId', async (req, reply) => {
      const { ownerId } = req.params as Record<string, any>;
      const found = store.get('orgs', ownerId);
      if (found === undefined) {
        reply.code(404);
        return { detail: 'Not found.' };
      }
      return found;
    });
  },

  seed,
};

export default plugin;
