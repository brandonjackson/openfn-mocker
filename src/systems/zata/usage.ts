import type { UsageExample } from '../types.js';

/**
 * Usage examples for the zata sandbox "Usage" tab, written against
 * @openfn/language-zata 1.1.3. get/post take a path relative to
 * `<baseUrl>/<apiVersion>/`. Note that 1.1.3's `post(path, data)` sends its
 * second argument as the request body verbatim (its docs' `{ body, header }`
 * wrapper would be sent as-is), so headers such as `companyId` / `branchId`
 * can only be set through `request(method, path, { body, headers })`.
 */
const saleBody = `{
  purchaseCode: '430341',
  paymentMethodID: 1,
  customerID: 1,
  transactionDate: '2024-01-01',
  customerTIN: '123456789',
  customerName: 'John Doe',
  customerPhone: '0788123456',
  items: [
    { productID: 1, units: 2, unitPrice: 5900, discountRate: 0, batchNumber: 'MF-2401' },
  ],
}`;

export const usage: UsageExample[] = [
  {
    fn: 'post',
    signature: 'post(path, data)',
    description: 'Record a sale transaction; the response carries the new invoiceID.',
    code: `post('transaction/sale', ${saleBody});`,
    apiRef: 'sale',
  },
  {
    fn: 'get',
    signature: 'get(path, options?)',
    description: 'Fetch a transaction (EBM invoice) by id.',
    code: "get('transaction/1001');",
    apiRef: 'getTxn',
  },
  {
    fn: 'get',
    signature: 'get(path, options?)',
    description: 'List transactions, a page at a time.',
    code: "get('transaction', { query: { perPage: 10, page: 1 } });",
    apiRef: 'listTxn',
  },
  {
    fn: 'get',
    signature: 'get(path, options?)',
    description: 'List the EBM product types.',
    code: "get('data/product-type');",
    apiRef: 'productTypes',
  },
  {
    fn: 'request',
    signature: 'request(method, path, options?)',
    description: 'Record a sale for a specific company and branch (headers need request()).',
    code: `request('POST', 'transaction/sale', {
  body: ${saleBody.replace(/\n/g, '\n  ')},
  headers: { companyId: 1, branchId: 1 },
});`,
    apiRef: 'sale',
  },
];
