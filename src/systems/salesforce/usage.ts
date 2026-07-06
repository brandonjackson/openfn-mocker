import type { UsageExample } from '../types.js';

/**
 * Usage examples for the salesforce sandbox "Usage" tab: one entry per adaptor
 * function. Read/write functions that go through the REST Data API cross-link to
 * the API request they fire (query / create / retrieve / describe).
 */
export const usage: UsageExample[] = [
  {
    fn: 'query',
    signature: 'query(soql, options?, callback?)',
    description: 'Run a SOQL query and return the matching records.',
    code: "query('SELECT Id, Name FROM Account');",
    apiRef: 'query',
  },
  {
    fn: 'create',
    signature: 'create(sObjectName, records, options?, callback?)',
    description: 'Create one or more records of an sObject type.',
    code: "create('Account', { Name: 'New Co' });",
    apiRef: 'create',
  },
  {
    fn: 'insert',
    signature: 'insert(sObjectName, records, options?, callback?)',
    description: 'Insert one or more records (alias of create) for an sObject type.',
    code: "insert('Contact', { LastName: 'Doe' });",
    apiRef: 'create',
  },
  {
    fn: 'update',
    signature: 'update(sObjectName, records, options?, callback?)',
    description: 'Update one or more existing records by Id.',
    code: "update('Account', { Id: '001000000000001AAA', Name: 'Acme Renamed' });",
    apiRef: 'create',
  },
  {
    fn: 'upsert',
    signature: 'upsert(sObjectName, externalId, records, options?, callback?)',
    description: 'Insert or update records keyed on an external id field.',
    code: "upsert('Account', 'External_Id__c', [{ External_Id__c: 'X1', Name: 'Up' }]);",
    apiRef: 'create',
  },
  {
    fn: 'retrieve',
    signature: 'retrieve(sObjectName, id, callback?)',
    description: 'Retrieve a single record by its Salesforce Id.',
    code: "retrieve('Account', '001000000000001AAA');",
    apiRef: 'retrieve',
  },
  {
    fn: 'describe',
    signature: 'describe(sObjectName, callback?)',
    description: 'Describe the metadata (fields, permissions) of an sObject.',
    code: "describe('Account');",
    apiRef: 'describe',
  },
  {
    fn: 'destroy',
    signature: 'destroy(sObjectName, ids, options?, callback?)',
    description: 'Delete one or more records by Id.',
    code: "destroy('Account', ['001000000000001AAA']);",
    apiRef: 'retrieve',
  },
];
