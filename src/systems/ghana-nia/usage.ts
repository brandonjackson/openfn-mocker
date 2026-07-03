import type { UsageExample } from '../types.js';

/**
 * Usage examples for the ghana-nia sandbox "Usage" tab: the OpenFn job code for
 * each adaptor function. `merchantKey` is appended to every request body by the
 * adaptor, so it never appears in these snippets.
 *
 * The adaptor also exports `get`, but its shared `request` helper dereferences
 * `data.merchantKey` before guarding for a missing body — and `get(path, query)`
 * passes no `data` — so a real `get()` throws client-side for any GET, before a
 * request is issued. It is omitted here rather than shipped as a snippet that
 * cannot run; the GET endpoint is still mocked (see the guide's "list" example).
 * Upstream bug, not a mock limitation.
 */
export const usage: UsageExample[] = [
  { fn: 'registerChild', signature: 'registerChild(data, callback = s => s)', description: 'Register a newborn with NIA and mint a baby Ghana Card PIN.',
    code: "registerChild({\n  babyData: { forenames: 'Kharis', surname: 'Osei', gender: 'Female', dateOfBirth: '2024-03-05' },\n  personVouching: { ghanaCardPIN: 'GHA-001097272-4', relationToBaby: 'Mother' }\n});", apiRef: 'register' },
  { fn: 'post', signature: 'post(path, data)', description: 'Make a POST request to an NIA endpoint (JSON body; merchantKey is appended automatically).',
    code: "post('/awopa/api/v1/baby/registration', {\n  babyData: { forenames: 'Ama', surname: 'Boateng', gender: 'Female' },\n  personVouching: { relationToBaby: 'Mother' }\n});", apiRef: 'register' },
];
