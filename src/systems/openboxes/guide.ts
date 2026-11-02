import type { SystemGuide } from '../types.js';

/**
 * Sandbox guide for the openboxes system: its blurb and the runnable example
 * requests shown on the sandbox "API" tab. Co-located with this system's seed
 * data and imported onto the plugin (`MockSystemPlugin.guide`); rendered by the
 * sandbox and referenced by usage examples' `apiRef` cross-links.
 *
 * Paths are the ones the adaptor calls against a real deployment, whose
 * baseUrl ends in `/api` (e.g. https://demo.openboxes.com/openboxes/api), and
 * the examples run create -> read -> update -> delete so each one works on the
 * record the previous one made. The `SANDBOX…` ids are fixed so the follow-up
 * requests can address them.
 */
const PRODUCT = '0000000000000000000000000000a001';
const LOCATION = '0000000000000000000000000000b001';
const MOVEMENT = '0000000000000000000000000000c001';
const SEEDED_MOVEMENT = '736d2d30303031000000000000000000';

export const guide: SystemGuide = {
  title: 'OpenBoxes',
  docs: 'https://docs.openfn.org/adaptors/packages/openboxes-docs',
  blurb:
    'Supply-chain & inventory management. Cookie login at POST /api/login (a JSESSIONID the adaptor replays); payloads nest under a `data` key and ids are 32-char hex. Products, locations and stock movements (with line items) are served; records update with POST or PUT on the item path.',
  auth: 'Session cookie (POST /api/login)',
  examples: [
    {
      id: 'login',
      method: 'POST',
      path: '/api/login',
      label: 'Log in: sets the JSESSIONID session cookie',
      body: JSON.stringify({ username: 'admin', password: 'mock' }, null, 2),
    },

    // Products
    { id: 'list-products', method: 'GET', path: '/api/products?max=10', label: 'List products ({ data, totalCount })' },
    {
      id: 'create-product',
      method: 'POST',
      path: '/api/products',
      label: 'Create a product (answers { product })',
      body: JSON.stringify(
        { id: PRODUCT, productCode: 'SANDBOX-001', name: 'Sandbox Product', unitOfMeasure: 'EA' },
        null,
        2
      ),
    },
    { id: 'get-product', method: 'GET', path: `/api/products/${PRODUCT}`, label: 'Read the product back' },
    {
      id: 'update-product',
      method: 'POST',
      path: `/api/products/${PRODUCT}`,
      label: 'Update the product (POST merges the posted fields)',
      body: JSON.stringify({ description: 'Updated from the sandbox' }, null, 2),
    },
    {
      id: 'replace-product',
      method: 'PUT',
      path: `/api/products/${PRODUCT}`,
      label: 'Update the product with PUT (same action as POST)',
      body: JSON.stringify({ pricePerUnit: 1.25 }, null, 2),
    },
    { id: 'delete-product', method: 'DELETE', path: `/api/products/${PRODUCT}`, label: 'Delete the product (204)' },

    // Locations
    { id: 'list-locations', method: 'GET', path: '/api/locations', label: 'Depots & wards' },
    {
      id: 'create-location',
      method: 'POST',
      path: '/api/locations',
      label: 'Create a location',
      body: JSON.stringify(
        { id: LOCATION, name: 'Sandbox Health Post', locationType: { name: 'Ward' } },
        null,
        2
      ),
    },
    { id: 'get-location', method: 'GET', path: `/api/locations/${LOCATION}`, label: 'Read the location back' },
    {
      id: 'update-location',
      method: 'POST',
      path: `/api/locations/${LOCATION}`,
      label: 'Update the location (POST)',
      body: JSON.stringify({ description: 'Renamed in the sandbox' }, null, 2),
    },
    {
      id: 'replace-location',
      method: 'PUT',
      path: `/api/locations/${LOCATION}`,
      label: 'Update the location (PUT)',
      body: JSON.stringify({ name: 'Sandbox Health Post (PUT)' }, null, 2),
    },
    { id: 'delete-location', method: 'DELETE', path: `/api/locations/${LOCATION}`, label: 'Delete the location (204)' },

    // Stock movements
    { id: 'list-stock-movements', method: 'GET', path: '/api/stockMovements?max=5', label: 'Stock movements' },
    {
      id: 'get-stock-movement',
      method: 'GET',
      path: `/api/stockMovements/${SEEDED_MOVEMENT}`,
      label: 'Read a stock movement (seeded SL-2024-0001)',
    },
    {
      id: 'stock-movement-items',
      method: 'GET',
      path: `/api/stockMovements/${SEEDED_MOVEMENT}/stockMovementItems`,
      label: 'Line items of a stock movement',
    },
    {
      id: 'create-stock-movement',
      method: 'POST',
      path: '/api/stockMovements',
      label: 'Create a stock movement (201)',
      body: JSON.stringify(
        {
          id: MOVEMENT,
          name: 'Sandbox transfer',
          description: 'Created from the sandbox',
          origin: { id: '6c6f632d6465706f742d626f00000000' },
          destination: { id: '6c6f632d6e67656c6568756e00000000' },
          dateRequested: '11/02/2026',
        },
        null,
        2
      ),
    },
    {
      id: 'delete-stock-movement',
      method: 'DELETE',
      path: `/api/stockMovements/${MOVEMENT}`,
      label: 'Delete the stock movement (204)',
    },
  ],
};
