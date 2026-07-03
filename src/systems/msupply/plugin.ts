import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { seed } from './seed.js';
import { usage } from './usage.js';
import { guide } from './guide.js';

/**
 * mSupply / Open mSupply (open-source pharmaceutical supply-chain system). The
 * msupply adaptor talks GraphQL over a single POST /graphql endpoint: it first
 * runs an `authToken` query to get a Bearer token (unless a token is supplied),
 * then sends the operation. This mock branches on the query string:
 *  - authToken           → { data: { authToken: { token } } }
 *  - itemsWithStats      → { data: { items: { nodes, totalCount } } }
 *  - batchOutboundShipment (upsert) → { data: { batchOutboundShipment: {...} } }
 *  - insertOutboundShipment         → { data: { insertOutboundShipment: InvoiceNode } }
 *  - anything else       → { data: {} }
 * Order matters: the upsert query also contains "insertOutboundShipment", so
 * batchOutboundShipment is matched first.
 */

/** Empty-but-shaped batch response (all line groups present, no errors). */
function emptyBatchResponse(): Record<string, any> {
  return {
    __typename: 'BatchOutboundShipmentResponse',
    insertOutboundShipments: [],
    updateOutboundShipments: [],
    deleteOutboundShipments: [],
    insertOutboundShipmentLines: [],
    updateOutboundShipmentLines: [],
    deleteOutboundShipmentLines: [],
    insertOutboundShipmentServiceLines: [],
    updateOutboundShipmentServiceLines: [],
    deleteOutboundShipmentServiceLines: [],
    insertOutboundShipmentUnallocatedLines: [],
    updateOutboundShipmentUnallocatedLines: [],
    deleteOutboundShipmentUnallocatedLines: [],
    allocateOutboundShipmentUnallocatedLines: [],
  };
}

const plugin: MockSystemPlugin = {
  name: 'msupply',
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
    app.post('/graphql', async (req) => {
      const body = (req.body ?? {}) as Record<string, any>;
      const query = typeof body.query === 'string' ? body.query : '';
      const variables = (body.variables ?? {}) as Record<string, any>;

      // --- Auth handshake (login → bearer token) ---
      if (query.includes('authToken')) {
        return { data: { authToken: { __typename: 'AuthToken', token: 'mock-msupply-token' } } };
      }

      // --- getItemsWithStats ---
      if (query.includes('itemsWithStats') || query.includes('items(')) {
        const nodes = store.list('items');
        return {
          data: { items: { __typename: 'ItemConnector', nodes, totalCount: nodes.length } },
        };
      }

      // --- upsertOutboundShipment (batch) — must precede the insert check ---
      if (query.includes('batchOutboundShipment')) {
        return { data: { batchOutboundShipment: emptyBatchResponse() } };
      }

      // --- insertOutboundShipment ---
      if (query.includes('insertOutboundShipment')) {
        const id = typeof variables.id === 'string' ? variables.id : randomUUID();
        const invoiceNumber = store.count('invoices') + 1;
        const invoice = {
          __typename: 'InvoiceNode',
          id,
          invoiceNumber,
          otherPartyId: variables.otherPartyId ?? null,
          storeId: variables.storeId ?? null,
        };
        store.create('invoices', id, invoice);
        return { data: { insertOutboundShipment: invoice } };
      }

      // --- generic query passthrough ---
      return { data: {} };
    });
  },

  seed,
};

export default plugin;
