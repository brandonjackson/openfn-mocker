import type { SystemGuide } from '../types.js';

/**
 * Sandbox guide for the progres system: its blurb and the runnable example
 * requests shown on the sandbox "API" tab. Referenced by the usage examples'
 * `apiRef` cross-links.
 *
 * DTP has no resources to browse — every example is a POST of one
 * interoperability message, and the message type is both the path segment and
 * the body's `request_type`. The bodies below are the reference integration's
 * (OpenFn/primero-progres) payloads with identifying details replaced.
 */
export const guide: SystemGuide = {
  title: 'UNHCR proGres v4 (DTP)',
  docs: 'https://docs.openfn.org/adaptors/packages/progres-docs',
  blurb:
    "UNHCR's refugee registration & case management system, reached through DTP — UNHCR's Data Transfer Platform, an Azure API Management gateway. There is no CRUD API: a partner system POSTs one message per interoperability event to /<MessageType>, with an Ocp-Apim-Subscription-Key header and a UNHCR-issued client certificate (mutual TLS). The adaptor's single operation, postData, is exactly that POST. proGres replies asynchronously, on the partner's own inbox, so these endpoints only acknowledge.",
  auth: 'Subscription key + client certificate',
  examples: [
    {
      id: 'referral',
      method: 'POST',
      path: '/ReceiveIncomingReferral',
      label: 'Refer a case into proGres (one message per service)',
      body: JSON.stringify(
        {
          request_type: 'ReceiveIncomingReferral',
          id: '9c506517-96c8-48e7-8fad-bb9711707174',
          service_implementing_agency: 'UNICEF',
          owned_by_agency_id: 'UNICEF',
          service_type: 'Documentation',
          service_type_other: null,
          service_response_day_time: '2021-04-28T19:34:43.000Z',
          service_referral_notes: 'Interoperability referral',
          primero_user: 'primero_cp',
          full_name: 'CP Worker',
          position: 'Case Worker',
          email: 'cp.worker@example.org',
          phone: '0000000000',
          unhcr_individual_no: 'CDO4756435098435',
          unhcr_id_no: 'CDO4756435098435-A',
          name_first: 'Safia',
          name_middle: null,
          name_last: 'Mara',
          date_of_birth: '2008-01-25',
          sex: 'female',
          address_current: 'Camp A',
          telephone_current: '+10000000000',
          protection_concerns: 'CR-AF',
          language: 'English',
          risk_level: 'Normal',
        },
        null,
        2
      ),
    },
    {
      id: 'decision',
      method: 'POST',
      path: '/ReceiveDecisionOutgoingReferral',
      label: 'Report the partner caseworker’s decision on a proGres referral',
      body: JSON.stringify(
        {
          request_type: 'ReceiveDecisionOutgoingReferral',
          case_id: 'b30cba6b-8d97-4524-b77f-a8f50cfcc974',
          primero_user: 'primero_cp',
          progres_interventionnumber: 'NAI-20-PRTITV-0000006',
          status: 'acknowledged',
          closure_reason: 'No reason specified.',
        },
        null,
        2
      ),
    },
    {
      id: 'feedback',
      method: 'POST',
      path: '/Feedback',
      label: 'Report that an intervention could not be delivered',
      body: JSON.stringify(
        {
          request_type: 'Feedback',
          case_id: 'b30cba6b-8d97-4524-b77f-a8f50cfcc974',
          primero_user: 'primero_cp',
          progres_interventionnumber: 'NAI-20-PRTITV-0000011',
          status: 'Delivery Fail',
          closure_reason:
            'Intervention referral is missing fields required for sending. Please include missing fields and re-send the request.',
        },
        null,
        2
      ),
    },
  ],
};
