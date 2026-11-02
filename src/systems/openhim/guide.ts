import type { SystemGuide } from '../types.js';

/**
 * Sandbox guide for the openhim system: its blurb and the runnable example
 * requests shown on the sandbox "API" tab. Co-located with this system's seed
 * data and imported onto the plugin (`MockSystemPlugin.guide`); rendered by the
 * sandbox and referenced by usage examples' `apiRef` cross-links.
 *
 * Ids below are the seeded records' (see seed.ts `oid`). Creates return a text
 * confirmation rather than the new doc (as OpenHIM core does), so the read,
 * update and delete examples use seeded records: the delete examples target
 * ones seeded to be disposable (a disabled channel, a retired client, a
 * completed task).
 */
const CHANNEL_CHW = '6368616e2d63687700000000';
const CHANNEL_DHIS2 = '6368616e2d64686973320000';
const CHANNEL_LEGACY = '6368616e2d6c656761637900';
const CLIENT_CHW = '636c69656e742d6368770000';
const CLIENT_REPORTER = '636c69656e742d7265700000';
const CLIENT_RETIRED = '636c69656e742d6f6c640000';
const TASK_COMPLETED = '7461736b2d31000000000000';
const TASK_PAUSED = '7461736b2d32000000000000';
const TXN_1 = '74786e2d3100000000000000';

const json = (body: unknown) => JSON.stringify(body, null, 2);

export const guide: SystemGuide = {
  title: 'OpenHIM',
  docs: 'https://docs.openfn.org/adaptors/packages/openhim-docs',
  blurb:
    'Health information mediator (OpenHIE). Manages the OpenHIM Core API — channels, clients, rerun tasks and (read-only) transactions as Mongo docs keyed by a 24-hex _id — plus a sample /chw/encounter mediator route. Lists return bare arrays; creates, updates (PUT, which merges into the stored doc) and deletes return a short text confirmation, as OpenHIM core does.',
  auth: 'Basic auth (username & password)',
  examples: [
    // Channels
    { id: 'channels-list', method: 'GET', path: '/channels', label: 'List channels (getChannels)' },
    { id: 'channels-get', method: 'GET', path: `/channels/${CHANNEL_CHW}`, label: 'Read one channel (getChannels(channelId))' },
    {
      id: 'channels-create',
      method: 'POST',
      path: '/channels',
      label: 'Create a channel (createChannel)',
      body: json({
        name: 'FHIR Server',
        urlPattern: '^/fhir/.*$',
        methods: ['GET', 'POST'],
        type: 'http',
        allow: ['fhir'],
        routes: [{ name: 'HAPI FHIR', host: 'hapi-fhir', port: 8080, primary: true }],
      }),
    },
    {
      id: 'channels-update',
      method: 'PUT',
      path: `/channels/${CHANNEL_DHIS2}`,
      label: 'Update a channel (narrow it to POST)',
      body: json({
        name: 'DHIS2 Reporting',
        description: 'Monthly facility reports to DHIS2',
        urlPattern: '^/dhis2/.*$',
        methods: ['POST'],
        type: 'http',
        status: 'enabled',
        allow: ['reporter'],
        routes: [{ name: 'DHIS2', host: 'dhis2.example.org', port: 443, secured: true, primary: true }],
      }),
    },
    { id: 'channels-delete', method: 'DELETE', path: `/channels/${CHANNEL_LEGACY}`, label: 'Delete the disabled legacy channel' },

    // Clients
    { id: 'clients-list', method: 'GET', path: '/clients', label: 'List clients (getClients)' },
    { id: 'clients-get', method: 'GET', path: `/clients/${CLIENT_CHW}`, label: 'Read one client (getClients(clientId))' },
    {
      id: 'clients-create',
      method: 'POST',
      path: '/clients',
      label: 'Register a client (createClient)',
      body: json({ clientID: 'fhir-server', name: 'FHIR Server', roles: ['fhir'], organization: 'MoHS' }),
    },
    {
      id: 'clients-update',
      method: 'PUT',
      path: `/clients/${CLIENT_REPORTER}`,
      label: 'Update a client (add a role)',
      body: json({ clientID: 'reporter', name: 'Facility Reporter', roles: ['reporter', 'fhir'], organization: 'MoHS' }),
    },
    { id: 'clients-delete', method: 'DELETE', path: `/clients/${CLIENT_RETIRED}`, label: 'Remove the retired pilot client' },

    // Transactions (read-only)
    { id: 'transactions-list', method: 'GET', path: '/transactions?filterLimit=5&filterPage=0', label: 'List transactions (getTransactions)' },
    { id: 'transactions-get', method: 'GET', path: `/transactions/${TXN_1}`, label: 'Read one transaction (getTransactions({ transactionId }))' },

    // Rerun tasks
    { id: 'tasks-list', method: 'GET', path: '/tasks?filterLimit=10&filterPage=0', label: 'List rerun tasks (getTasks)' },
    { id: 'tasks-get', method: 'GET', path: `/tasks/${TASK_COMPLETED}`, label: 'Read one task (getTasks({ taskId }))' },
    {
      id: 'tasks-create',
      method: 'POST',
      path: '/tasks',
      label: 'Rerun a transaction (createTask)',
      body: json({ tids: [TXN_1], batchSize: 1, paused: true }),
    },
    {
      id: 'tasks-update',
      method: 'PUT',
      path: `/tasks/${TASK_PAUSED}`,
      label: 'Resume a paused task',
      body: json({ status: 'Queued', user: 'root@openhim.org', remainingTransactions: 1, totalTransactions: 1, batchSize: 1 }),
    },
    { id: 'tasks-delete', method: 'DELETE', path: `/tasks/${TASK_COMPLETED}`, label: 'Delete a completed task' },

    // Sample mediator route
    {
      id: 'encounter',
      method: 'POST',
      path: '/chw/encounter',
      label: 'Post a CHW encounter (createEncounter)',
      body: json({ patient: 'Jane Doe', observations: [{ code: 'temp', value: 37.2 }] }),
    },
  ],
};
