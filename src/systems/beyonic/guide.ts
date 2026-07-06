import type { SystemGuide } from '../types.js';

/**
 * Sandbox guide for the beyonic system. Paths match the DRF-style resources the
 * adaptor POSTs to under `/api`; listings return `{ results: [...] }` and
 * creates echo the stored object with a generated integer id.
 */
export const guide: SystemGuide = {
  title: 'Beyonic',
  docs: 'https://docs.openfn.org/adaptors/packages/beyonic-docs',
  blurb:
    'Mobile-money payments across East & West Africa. The adaptor authenticates with a Token header and posts to /payments, /contacts and /collectionrequests. Listings use a DRF-style { results: [...] } envelope; resource ids are integers.',
  auth: 'API key (Token header)',
  examples: [
    {
      id: 'createPayment',
      method: 'POST',
      path: '/payments',
      label: 'Create a payment',
      body: JSON.stringify(
        { phonenumber: '+256777000111', amount: 5000, currency: 'UGX', description: 'Salary' },
        null,
        2
      ),
    },
    { id: 'listPayments', method: 'GET', path: '/payments', label: 'List payments' },
    {
      id: 'createContact',
      method: 'POST',
      path: '/contacts',
      label: 'Create a contact',
      body: JSON.stringify(
        { first_name: 'Ada', last_name: 'Lovelace', phonenumber: '+256777000111' },
        null,
        2
      ),
    },
    {
      id: 'createCollection',
      method: 'POST',
      path: '/collectionrequests',
      label: 'Create a collection request',
      body: JSON.stringify({ phonenumber: '+256777000111', amount: 2000, currency: 'UGX' }, null, 2),
    },
  ],
};
