import type { UsageExample } from '../types.js';

/**
 * Usage examples for the msupply sandbox "Usage" tab: the OpenFn job code for
 * each adaptor function, authored next to this system's seed data so a snippet
 * and the records it reads stay together. Every function POSTs to /graphql, so
 * the snippets pass only GraphQL variables (or a query string) — no absolute URL
 * appears. Rendered by the sandbox and run by `pnpm test:usage`.
 */
export const usage: UsageExample[] = [
  {
    fn: 'getItemsWithStats',
    signature: 'getItemsWithStats(variables)',
    description: 'Get the catalogue items for a store, with consumption/stock stats.',
    code: "getItemsWithStats({\n  storeId: 'store-a',\n  key: 'name',\n  first: 50,\n});",
    apiRef: 'items',
  },
  {
    fn: 'insertOutboundShipment',
    signature: 'insertOutboundShipment(variables)',
    description: 'Create an outbound shipment (an id is generated for you).',
    code: "insertOutboundShipment({\n  otherPartyId: 'customer-1',\n  storeId: 'store-a',\n});",
    apiRef: 'insert',
  },
  {
    fn: 'upsertOutboundShipment',
    signature: 'upsertOutboundShipment(variables)',
    description: 'Batch insert/update/delete lines of an outbound shipment.',
    code: "upsertOutboundShipment({\n  storeId: 'store-a',\n  input: { insertOutboundShipments: [{ id: 'shipment-1', otherPartyId: 'customer-1' }] },\n});",
    apiRef: 'upsert',
  },
  {
    fn: 'query',
    signature: 'query(query, variables = {})',
    description: 'Make a generic GraphQL request against Open mSupply.',
    code: "query(`query { items(storeId: \"store-a\") { totalCount } }`);",
    apiRef: 'query',
  },
];
