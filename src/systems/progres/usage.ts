import type { UsageExample } from '../types.js';

/**
 * Usage examples for the progres sandbox "Usage" tab. postData is a generic
 * mutual-TLS POST: the client cert/private key go in `agentOptions` and the token
 * in a header, all pulled from the credential. postData passes `url` straight to
 * the request client (`new URL(url)`), so it must be absolute; we build it from
 * `state.configuration.url` via a function (resolved by expandReferences) so it
 * stays same-origin and carries no literal external URL in the job code.
 */
export const usage: UsageExample[] = [
  { fn: 'postData', signature: 'postData(params, callback = s => s)', description: 'POST data to proGres with a client certificate + token (mutual TLS).',
    code: "postData({\n  url: (state) => `${state.configuration.url}/api/v4/individuals`,\n  body: { givenName: 'Amara', familyName: 'Okoye', dateOfBirth: '1990-01-01' },\n  headers: { Authorization: `Bearer ${$.configuration.token}` },\n  agentOptions: { key: $.configuration.key, cert: $.configuration.cert }\n});", apiRef: 'register' },
];
