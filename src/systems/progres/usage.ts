import type { UsageExample } from '../types.js';

/**
 * Usage examples for the progres sandbox "Usage" tab. The adaptor has exactly
 * one operation, postData — a mutual-TLS POST — so every interoperability
 * message is the same call with a different last path segment and
 * `request_type`. The client certificate and private key go in `agentOptions`
 * and the APIM subscription key (the credential's `token`) in the
 * Ocp-Apim-Subscription-Key header, the way OpenFn's UNICEF/UNHCR reference
 * integration sends them.
 *
 * postData passes `url` straight to the request client (`new URL(url)`), so it
 * must be absolute; we build it from `state.configuration.url` via a function
 * (resolved by expandReferences) so it stays same-origin and carries no literal
 * external URL in the job code. Against real DTP the credential's `url` is
 * usually the full message endpoint already, and the job posts to it directly.
 */
export const usage: UsageExample[] = [
  {
    fn: 'postData',
    signature: 'postData(params, callback = s => s)',
    description: 'Refer a case into proGres: POST a ReceiveIncomingReferral message to DTP.',
    code: "postData({\n  url: (state) => `${state.configuration.url}/ReceiveIncomingReferral`,\n  body: {\n    request_type: 'ReceiveIncomingReferral',\n    id: '9c506517-96c8-48e7-8fad-bb9711707174',\n    service_type: 'Documentation',\n    unhcr_individual_no: 'CDO4756435098435',\n    name_first: 'Safia',\n    name_last: 'Mara',\n  },\n  headers: { 'Ocp-Apim-Subscription-Key': $.configuration.token },\n  agentOptions: { key: $.configuration.key, cert: $.configuration.cert }\n});",
    apiRef: 'referral',
  },
  {
    fn: 'postData',
    signature: 'postData(params, callback = s => s)',
    description: "Close the loop on a referral proGres sent out: POST the caseworker's decision.",
    code: "postData({\n  url: (state) => `${state.configuration.url}/ReceiveDecisionOutgoingReferral`,\n  body: {\n    request_type: 'ReceiveDecisionOutgoingReferral',\n    case_id: 'b30cba6b-8d97-4524-b77f-a8f50cfcc974',\n    progres_interventionnumber: 'NAI-20-PRTITV-0000006',\n    status: 'acknowledged',\n    closure_reason: 'No reason specified.',\n  },\n  headers: { 'Ocp-Apim-Subscription-Key': $.configuration.token },\n  agentOptions: { key: $.configuration.key, cert: $.configuration.cert }\n});",
    apiRef: 'decision',
  },
  {
    fn: 'postData',
    signature: 'postData(params, callback = s => s)',
    description: 'Tell proGres an intervention could not be delivered: POST a Feedback message.',
    code: "postData({\n  url: (state) => `${state.configuration.url}/Feedback`,\n  body: {\n    request_type: 'Feedback',\n    progres_interventionnumber: 'NAI-20-PRTITV-0000011',\n    status: 'Delivery Fail',\n    closure_reason: 'Intervention referral is missing fields required for sending.',\n  },\n  headers: { 'Ocp-Apim-Subscription-Key': $.configuration.token },\n  agentOptions: { key: $.configuration.key, cert: $.configuration.cert }\n});",
    apiRef: 'feedback',
  },
];
