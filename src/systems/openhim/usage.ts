import type { UsageExample } from '../types.js';

/**
 * Usage examples for the openhim sandbox "Usage" tab: the OpenFn job code for each
 * adaptor function, authored next to this system's seed data so a snippet and the
 * records it reads stay together. Rendered by the sandbox and run end to end by
 * `pnpm test:usage`.
 */
export const usage: UsageExample[] = [
  { fn: "getChannels", signature: "getChannels(channelId?)", description: "Fetch all OpenHIM channel records, or a single channel by id.",
    code: "getChannels();", apiRef: "channels-list" },
  { fn: "createChannel", signature: "createChannel(body)", description: "Create a new routing channel in OpenHIM.",
    code: "createChannel({ name: 'FHIR Server Testing', urlPattern: '^/fhir/.*$', methods: ['GET', 'POST'] });", apiRef: "channels-create" },
  { fn: "getClients", signature: "getClients(clientId?)", description: "Fetch all registered OpenHIM client records, or a single client by id.",
    code: "getClients();", apiRef: "clients-list" },
  { fn: "createClient", signature: "createClient(body)", description: "Register a new client record in OpenHIM.",
    code: "createClient({ clientID: 'fhir-server-7', name: 'FHIR Server', roles: ['fhir'] });", apiRef: "clients-create" },
  { fn: "getTransactions", signature: "getTransactions(options = {})", description: "Fetch OpenHIM transactions, optionally filtered/paginated or by id.",
    code: "getTransactions({ filterLimit: 5, filterPage: 0 });", apiRef: "transactions-list" },
  { fn: "getTasks", signature: "getTasks(options)", description: "Fetch all OpenHIM tasks, or a single task by id.",
    code: "getTasks({ filterLimit: 10, filterPage: 0 });", apiRef: "tasks-list" },
  { fn: "createTask", signature: "createTask(body)", description: "Create a new orchestrated task (batch of transaction retries).",
    code: "createTask({ tids: ['5bb777777bbb66cc5d4444ee'], batchSize: 2, paused: true });", apiRef: "tasks-create" },
  { fn: "createEncounter", signature: "createEncounter(encounterData)", description: "Create a CHW encounter record via the sample mediator route.",
    code: "createEncounter({ patientId: '12345', encounterType: 'home-visit' });", apiRef: "encounter" },
  { fn: "http.request", signature: "http.request(method, path, body, options = {})", description: "Make a general-purpose HTTP request with any method to OpenHIM.",
    code: "http.request('GET', '/transactions');", apiRef: "transactions-list" },
  { fn: "http.get", signature: "http.get(path, options = {})", description: "Make a GET request to any OpenHIM Core API path.",
    code: "http.get('/transactions');", apiRef: "transactions-list" },
  // OpenHIM core answers creates, updates and deletes with a text/plain
  // confirmation, and the http helpers parse JSON by default, so pass
  // { parseAs: 'text' } for those (as createClient etc. do internally).
  { fn: "http.post", signature: "http.post(path, body, options = {})", description: "Make a POST request to any OpenHIM Core API path. Core replies to creates with plain text, so parse the response as text.",
    code: "http.post('/clients', { clientID: 'mock-client', name: 'Mock Client', roles: ['test'] }, { parseAs: 'text' });", apiRef: "clients-create" },
  { fn: "http.put", signature: "http.put(path, body, options = {})", description: "Make a PUT request to update an OpenHIM record (core merges the given fields and replies with plain text).",
    code: "http.put('/channels/6368616e2d63687700000000', { name: 'Updated Channel', urlPattern: '^/updated$', methods: ['GET', 'POST'] }, { parseAs: 'text' });", apiRef: "channels-update" },
  { fn: "http._delete", signature: "http._delete(path, options = {})", description: "Make a DELETE request to remove an OpenHIM record (core replies with plain text).",
    code: "http._delete('/tasks/7461736b2d31000000000000', { parseAs: 'text' });", apiRef: "tasks-delete" },
];
