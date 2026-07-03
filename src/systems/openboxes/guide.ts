import type { SystemGuide } from '../types.js';

/**
 * Sandbox guide for the openboxes system: its blurb and the runnable example
 * requests shown on the sandbox "API" tab. Co-located with this system's seed
 * data and imported onto the plugin (`MockSystemPlugin.guide`); rendered by the
 * sandbox and referenced by usage examples' `apiRef` cross-links.
 */
export const guide: SystemGuide = {
  title: 'OpenBoxes',
  docs: 'https://docs.openfn.org/adaptors/packages/openboxes-docs',
  blurb:
    "Supply-chain & inventory management. Token login at POST /api/login; every payload nests under a `data` key and ids are 32-char hex. Products, locations and stock movements (with line items) are served.",
  auth: 'Token (POST /api/login)',
  examples: [
    {
      method: 'POST',
      path: '/api/login',
      label: 'Login: returns { data: { token } }',
      body: JSON.stringify({ username: 'admin', password: 'mock' }, null, 2),
    },
    { method: 'GET', path: '/api/products', label: 'Products ({ data: [...] })' },
    { method: 'GET', path: '/api/locations', label: 'Depots & wards' },
    { method: 'GET', path: '/api/stockMovements', label: 'Stock movements' },
    {
      method: 'POST',
      path: '/api/products',
      label: 'Create a product',
      body: JSON.stringify({ productCode: 'SANDBOX-001', name: 'Sandbox Product', unitOfMeasure: 'EA' }, null, 2),
    },
  ],
};
