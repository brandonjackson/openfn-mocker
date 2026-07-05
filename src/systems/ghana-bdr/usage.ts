import type { UsageExample } from '../types.js';

/**
 * Usage examples for the ghana-bdr sandbox "Usage" tab. `username`/`password` are
 * appended to every request body by the adaptor, so they never appear here.
 *
 * The adaptor also exports `get`, but its shared `request` helper dereferences
 * `data.username` before guarding for a missing body — and `get(path, query)`
 * passes no `data` — so a real `get()` call throws client-side for any GET,
 * before a request is issued. It is therefore omitted here rather than shipped as
 * a snippet that cannot run; the GET /api/notification endpoint is still mocked
 * (see the guide's "list" API example). Upstream bug, not a mock limitation.
 */
export const usage: UsageExample[] = [
  { fn: 'sendBirthNotification', signature: 'sendBirthNotification(data, callback = s => s)', description: 'Register a birth and generate a birth certificate number.',
    code: "sendBirthNotification({\n  registry_code: '011803',\n  child: { first_name: 'Test', Surname: 'Testerson', birth_date: '2024/03/04', gender_code: '2' },\n  mother: { national_id_number: 'GHA-000000000-2', first_name: 'Ama' },\n  father: { first_name: 'Kofi', Surname: 'Doe' }\n});", apiRef: 'notify' },
  { fn: 'post', signature: 'post(path, data)', description: 'Make a POST request to a BDR endpoint (username/password appended automatically).',
    code: "post('/api/notification', {\n  registry_code: '011803',\n  child: { first_name: 'Ama', Surname: 'Boateng', birth_date: '2024/05/12', gender_code: '2' }\n});", apiRef: 'notify' },
];
