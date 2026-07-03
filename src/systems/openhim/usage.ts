import type { UsageExample } from '../types.js';

/**
 * Usage examples for the openhim sandbox "Usage" tab: the OpenFn job code for each
 * adaptor function, authored next to this system's seed data so a snippet and the
 * records it reads stay together. Rendered by the sandbox and run end to end by
 * `pnpm test:usage`.
 */
export const usage: UsageExample[] = [
  { fn: "getChannels", signature: "getChannels(channelId?)", description: "Fetch all OpenHIM channel records, or a single channel by id.",
    code: "getChannels();", apiRef: "ex0" },
  { fn: "createChannel", signature: "createChannel(body)", description: "Create a new routing channel in OpenHIM.",
    code: "createChannel({ name: 'FHIR Server Testing', urlPattern: '^/fhir/.*$', methods: ['GET', 'POST'] });" },
  { fn: "getClients", signature: "getClients(clientId?)", description: "Fetch all registered OpenHIM client records, or a single client by id.",
    code: "getClients();", apiRef: "ex1" },
  { fn: "createClient", signature: "createClient(body)", description: "Register a new client record in OpenHIM.",
    code: "createClient({ clientID: 'fhir-server-7', name: 'FHIR Server', roles: ['fhir'] });", apiRef: "ex3" },
  { fn: "getTransactions", signature: "getTransactions(options = {})", description: "Fetch OpenHIM transactions, optionally filtered/paginated or by id.",
    code: "getTransactions({ filterLimit: 5, filterPage: 0 });", apiRef: "ex2" },
  { fn: "getTasks", signature: "getTasks(options)", description: "Fetch all OpenHIM tasks, or a single task by id.",
    code: "getTasks({ filterLimit: 10, filterPage: 0 });" },
  { fn: "createTask", signature: "createTask(body)", description: "Create a new orchestrated task (batch of transaction retries).",
    code: "createTask({ tids: ['5bb777777bbb66cc5d4444ee'], batchSize: 2, paused: true });" },
  { fn: "createEncounter", signature: "createEncounter(encounterData)", description: "Create a CHW encounter record via the sample mediator route.",
    code: "createEncounter({ patientId: '12345', encounterType: 'home-visit' });", apiRef: "ex4" },
  { fn: "http.request", signature: "http.request(method, path, body, options = {})", description: "Make a general-purpose HTTP request with any method to OpenHIM.",
    code: "http.request('GET', '/transactions');", apiRef: "ex2" },
  { fn: "http.get", signature: "http.get(path, options = {})", description: "Make a GET request to any OpenHIM Core API path.",
    code: "http.get('/transactions');", apiRef: "ex2" },
  { fn: "http.post", signature: "http.post(path, body, options = {})", description: "Make a POST request to any OpenHIM Core API path.",
    code: "http.post('/clients', { clientID: 'mock-client', name: 'Mock Client', roles: ['test'] });" },
  { fn: "http.put", signature: "http.put(path, body, options = {})", description: "Make a PUT request to replace an OpenHIM record.",
    code: "http.put('/channels/6368616e2d63687700000000', { name: 'Updated Channel', urlPattern: '^/updated$', methods: ['GET', 'POST'] });" },
  { fn: "http._delete", signature: "http._delete(path, options = {})", description: "Make a DELETE request to remove an OpenHIM record.",
    code: "http._delete('/tasks/7461736b2d31000000000000');" },
];
