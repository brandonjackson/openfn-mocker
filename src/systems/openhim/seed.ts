import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';

/**
 * OpenHIM seed (health-information-mediator Digital Public Good). Seeds a couple
 * of channels, clients, tasks and transactions — the OpenHIM Core API resources
 * the openhim adaptor reads and creates. OpenHIM records are Mongo documents
 * keyed by a 24-hex `_id`.
 */

/** A stable, Mongo-style 24-char hex id. */
export function oid(seed: string): string {
  let hex = '';
  for (let i = 0; i < seed.length && hex.length < 24; i++) {
    hex += seed.charCodeAt(i).toString(16);
  }
  return (hex + '000000000000000000000000').slice(0, 24);
}

export function seed(store: DataStore, _config: SystemConfig): void {
  const channels = [
    {
      _id: oid('chan-chw'), name: 'CHW Encounters', urlPattern: '^/chw/.*$', methods: ['POST'], type: 'http', status: 'enabled', allow: ['chw'],
      routes: [{ name: 'CHW Mediator', type: 'http', status: 'enabled', secured: false, host: 'chw-mediator', port: 3000, primary: true }],
    },
    {
      _id: oid('chan-dhis2'), name: 'DHIS2 Reporting', urlPattern: '^/dhis2/.*$', methods: ['GET', 'POST'], type: 'http', status: 'enabled', allow: ['reporter'],
      routes: [{ name: 'DHIS2', type: 'http', status: 'enabled', secured: true, host: 'dhis2.example.org', port: 443, primary: true }],
    },
    {
      _id: oid('chan-legacy'), name: 'Legacy Lab Feed', urlPattern: '^/lab/.*$', methods: ['POST'], type: 'http', status: 'disabled', allow: ['lab'],
      routes: [{ name: 'Old LIS', type: 'http', status: 'disabled', secured: false, host: 'lis.internal', port: 8080, primary: true }],
    },
  ];
  for (const c of channels) store.create('channels', c._id, c);

  const clients = [
    { _id: oid('client-chw'), clientID: 'chw', name: 'CHW Mobile App', roles: ['chw'], organization: 'MoHS' },
    { _id: oid('client-rep'), clientID: 'reporter', name: 'Facility Reporter', roles: ['reporter'], organization: 'MoHS' },
    { _id: oid('client-old'), clientID: 'pilot-app', name: 'Retired Pilot App', roles: ['lab'], organization: 'MoHS' },
  ];
  for (const c of clients) store.create('clients', c._id, c);

  const tasks = [
    {
      _id: oid('task-1'),
      status: 'Completed',
      transactions: [
        { tid: oid('txn-1'), tstatus: 'Completed' },
        { tid: oid('txn-2'), tstatus: 'Completed' },
      ],
      remainingTransactions: 0,
      totalTransactions: 2,
      batchSize: 1,
      user: 'root@openhim.org',
      created: '2024-03-01T10:00:00.000Z',
      completedDate: '2024-03-01T10:00:04.000Z',
    },
    {
      _id: oid('task-2'),
      status: 'Paused',
      transactions: [{ tid: oid('txn-2'), tstatus: 'Queued' }],
      remainingTransactions: 1,
      totalTransactions: 1,
      batchSize: 1,
      user: 'root@openhim.org',
      created: '2024-03-04T09:00:00.000Z',
    },
  ];
  for (const t of tasks) store.create('tasks', t._id, t);

  const transactions = [
    {
      _id: oid('txn-1'),
      clientID: oid('client-chw'),
      channelID: oid('chan-chw'),
      status: 'Successful',
      request: { path: '/chw/encounter', method: 'POST', timestamp: '2024-03-01T10:05:00.000Z' },
      response: { status: 201, timestamp: '2024-03-01T10:05:01.000Z' },
    },
    {
      _id: oid('txn-2'),
      clientID: oid('client-rep'),
      channelID: oid('chan-dhis2'),
      status: 'Successful',
      request: { path: '/dhis2/api/dataValueSets', method: 'POST', timestamp: '2024-03-02T08:00:00.000Z' },
      response: { status: 200, timestamp: '2024-03-02T08:00:02.000Z' },
    },
  ];
  for (const t of transactions) store.create('transactions', t._id, t);
}
