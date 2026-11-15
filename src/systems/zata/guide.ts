import type { SystemGuide } from '../types.js';

/**
 * Sandbox guide for the zata system. Paths are the ones the adaptor builds
 * (`${baseUrl}/v1/${path}`, the mount standing for the baseUrl, which already
 * carries `/api`); bodies and responses follow Zata's own OpenAPI. A sale
 * returns `{ message, invoiceID }`, and the invoice can then be read by id or
 * found in the paginated listing. getTxn targets the seed invoice 1001.
 */
export const guide: SystemGuide = {
  title: 'Zata',
  docs: 'https://docs.openfn.org/adaptors/packages/zata-docs',
  blurb:
    'Zata, Rwanda EBM tax compliance. The adaptor exposes generic get / post / put / request verbs over the Zata REST API (`<baseUrl>/v1/...`), authenticated with a Bearer API token. A sale POSTed to /v1/transaction/sale is signed into an EBM invoice and returns its invoiceID; the invoice can then be fetched by id or listed.',
  auth: 'API key (Bearer token)',
  examples: [
    {
      id: 'sale',
      method: 'POST',
      path: '/v1/transaction/sale',
      label: 'Record a sale transaction',
      body: JSON.stringify(
        {
          purchaseCode: '430341',
          paymentMethodID: 1,
          customerID: 1,
          transactionDate: '2024-01-01',
          note: 'Counter sale',
          customerTIN: '123456789',
          customerName: 'John Doe',
          customerPhone: '0788123456',
          items: [{ productID: 1, units: 2, unitPrice: 5900, discountRate: 0, batchNumber: 'MF-2401' }],
        },
        null,
        2
      ),
    },
    {
      id: 'getTxn',
      method: 'GET',
      path: '/v1/transaction/1001',
      label: 'Fetch a transaction (invoice) by id',
    },
    { id: 'listTxn', method: 'GET', path: '/v1/transaction?perPage=10&page=1', label: 'List transactions' },
    { id: 'productTypes', method: 'GET', path: '/v1/data/product-type', label: 'List EBM product types' },
  ],
};
