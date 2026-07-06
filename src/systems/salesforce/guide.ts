import type { SystemGuide } from '../types.js';

/**
 * Sandbox guide for the salesforce system. Paths mirror the REST Data API the
 * jsforce-backed adaptor talks to after login. The `query` example reads the
 * SOQL from `?q=` (the mock parses the sObject after `FROM`); `describe` is a
 * distinct route registered before `/:id` so it isn't mistaken for a record id.
 */
export const guide: SystemGuide = {
  title: 'Salesforce',
  docs: 'https://docs.openfn.org/adaptors/packages/salesforce-docs',
  blurb:
    'Salesforce CRM via the jsforce-backed adaptor: a SOAP username/password login yields a session id, then all data access goes through the REST Data API under /services/data/vXX.X. This mock serves the sObject CRUD routes, describe, and a SOQL query endpoint that parses the sObject name out of the SELECT.',
  auth: 'Username/password (SOAP login → session id)',
  examples: [
    {
      id: 'query',
      method: 'GET',
      path: '/services/data/v50.0/query?q=SELECT+Id,Name+FROM+Account',
      label: 'Run a SOQL query',
    },
    {
      id: 'create',
      method: 'POST',
      path: '/services/data/v50.0/sobjects/Account',
      label: 'Create an Account record',
      body: JSON.stringify({ Name: 'New Co' }, null, 2),
    },
    {
      id: 'retrieve',
      method: 'GET',
      path: '/services/data/v50.0/sobjects/Account/001000000000001AAA',
      label: 'Retrieve an Account by Id',
    },
    {
      id: 'describe',
      method: 'GET',
      path: '/services/data/v50.0/sobjects/Account/describe',
      label: 'Describe the Account sObject',
    },
  ],
};
