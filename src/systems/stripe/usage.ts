import type { UsageExample } from '../types.js';

/**
 * Usage examples for the stripe sandbox "Usage" tab. The adaptor's list/get
 * verbs take a resource path (relative to the /v1 base) and return the parsed
 * Stripe response.
 */
export const usage: UsageExample[] = [
  {
    fn: 'list',
    signature: 'list(path, options?)',
    description: 'List objects for a Stripe resource (e.g. customers).',
    code: "list('customers');",
    apiRef: 'listCustomers',
  },
  {
    fn: 'get',
    signature: 'get(path, options?)',
    description: 'Retrieve a single Stripe object by resource path.',
    code: "get('customers/cus_seed01');",
    apiRef: 'getCustomer',
  },
];
