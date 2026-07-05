import type { SystemGuide } from '../types.js';

/**
 * Sandbox guide for the msupply system: its blurb and the runnable example
 * requests shown on the sandbox "API" tab. Co-located with this system's seed
 * data and imported onto the plugin (`MockSystemPlugin.guide`); rendered by the
 * sandbox and referenced by usage examples' `apiRef` cross-links. Every request
 * is a POST to the single GraphQL endpoint; the handler branches on the query.
 */
export const guide: SystemGuide = {
  title: 'mSupply / Open mSupply',
  docs: 'https://docs.openfn.org/adaptors/packages/msupply-docs',
  blurb:
    'Open-source pharmaceutical supply-chain & inventory management over a single GraphQL endpoint (POST /graphql). The adaptor first logs in with an authToken query (or a pre-supplied token) then sends its query as a Bearer request: getItemsWithStats reads catalogue stock, insert/upsertOutboundShipment write shipments, and query runs any GraphQL you pass.',
  auth: 'Bearer (GraphQL authToken)',
  examples: [
    {
      method: 'POST',
      path: '/graphql',
      label: 'Login: authToken → { token }',
      id: 'auth',
      body: JSON.stringify(
        {
          query:
            'query AuthToken($username: String!, $password: String!) { authToken(username: $username, password: $password) { ... on AuthToken { token } } }',
          variables: { username: 'admin', password: 'secret' },
        },
        null,
        2
      ),
    },
    {
      method: 'POST',
      path: '/graphql',
      label: 'getItemsWithStats: catalogue items + stock stats',
      id: 'items',
      body: JSON.stringify(
        {
          query: 'query itemsWithStats($storeId: String!) { items(storeId: $storeId) { nodes { id code name } totalCount } }',
          variables: { storeId: 'store-a' },
        },
        null,
        2
      ),
    },
    {
      method: 'POST',
      path: '/graphql',
      label: 'insertOutboundShipment: create a shipment',
      id: 'insert',
      body: JSON.stringify(
        {
          query:
            'mutation insertOutboundShipment($id: String!, $otherPartyId: String!, $storeId: String!) { insertOutboundShipment(storeId: $storeId, input: {id: $id, otherPartyId: $otherPartyId}) { ... on InvoiceNode { id invoiceNumber } } }',
          variables: { id: 'shipment-1', otherPartyId: 'customer-1', storeId: 'store-a' },
        },
        null,
        2
      ),
    },
    {
      method: 'POST',
      path: '/graphql',
      label: 'upsertOutboundShipment: batch mutate a shipment',
      id: 'upsert',
      body: JSON.stringify(
        {
          query:
            'mutation upsertOutboundShipment($storeId: String!, $input: BatchOutboundShipmentInput!) { batchOutboundShipment(storeId: $storeId, input: $input) { __typename } }',
          variables: { storeId: 'store-a', input: {} },
        },
        null,
        2
      ),
    },
    {
      method: 'POST',
      path: '/graphql',
      label: 'query: run any GraphQL request',
      id: 'query',
      body: JSON.stringify(
        { query: 'query { items(storeId: "store-a") { totalCount } }', variables: {} },
        null,
        2
      ),
    },
  ],
};
