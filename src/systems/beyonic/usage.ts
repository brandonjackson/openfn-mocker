import type { UsageExample } from '../types.js';

/**
 * Usage examples for the beyonic sandbox "Usage" tab: one entry per adaptor
 * function (createPayment, createContact, createCollectionRequest).
 */
export const usage: UsageExample[] = [
  {
    fn: 'createPayment',
    signature: 'createPayment(data, callback?)',
    description: 'Send a mobile-money payment to a phone number.',
    code: "createPayment({\n  phonenumber: '+256777000111',\n  amount: 5000,\n  currency: 'UGX',\n  description: 'Salary'\n});",
    apiRef: 'createPayment',
  },
  {
    fn: 'createContact',
    signature: 'createContact(data, callback?)',
    description: 'Create a contact in Beyonic.',
    code: "createContact({\n  first_name: 'Ada',\n  last_name: 'Lovelace',\n  phonenumber: '+256777000111'\n});",
    apiRef: 'createContact',
  },
  {
    fn: 'createCollectionRequest',
    signature: 'createCollectionRequest(data, callback?)',
    description: 'Request a mobile-money collection (payment in) from a phone number.',
    code: "createCollectionRequest({\n  phonenumber: '+256777000111',\n  amount: 2000,\n  currency: 'UGX'\n});",
    apiRef: 'createCollection',
  },
];
