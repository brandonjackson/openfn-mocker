import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';

/**
 * proGres/DTP seed. DTP is a message gateway, not a record store, so what the
 * mock keeps is the state a run of messages builds up — inspectable at
 * `/_admin/store`, never served as a REST collection (proGres exposes none).
 *
 *  - `interventions` — proGres interventions, keyed by intervention number and
 *    shaped like the ones DTP emits (proGres/Dataverse attribute names, dotted
 *    where the value comes from a related entity; see the sample payloads in
 *    OpenFn/primero-progres). Two are seeded as already sent OUT to the partner,
 *    so a /ReceiveDecisionOutgoingReferral or /Feedback message posted from the
 *    sandbox has a real intervention number to close the loop on.
 *  - `referrals` — inbound referrals received on /ReceiveIncomingReferral, kept
 *    verbatim under the sender's own `id`. One is seeded from the reference
 *    integration's sample referral.
 *
 * The mock-side bookkeeping keys (`direction`, `review_status`,
 * `decision_status`, `delivery_status`, ...) are the mock's own, not proGres
 * attributes; they record what each message did.
 */
export function seed(store: DataStore, _config: SystemConfig): void {
  const interventions: Record<string, any>[] = [
    {
      // The intervention proGres raised from the seeded inbound referral below.
      progres_interventionnumber: 'NAI-20-PRTITV-0000001',
      'interventiontype.progres_description': 'Documentation',
      'individuals.progres_id': 'CDO4756435098435',
      'individuals.progres_givenname': 'Safia',
      'individuals.progres_familyname': 'Mara',
      progres_orgreferralid: '9c506517-96c8-48e7-8fad-bb9711707174',
      direction: 'incoming',
      review_status: 'Pending Review',
    },
    {
      progres_interventionnumber: 'NAI-20-PRTITV-0000006',
      progres_lpinterventionid: '3ad9bf45-42c2-ed11-83fe-000d3aaca11b',
      progres_interventiontype2: '124d0594-77a1-ea11-8105-00155d680582',
      progres_interventionstartdate: '2021-04-20T00:00:00Z',
      progres_businessowner: '54aff07f-e8d5-ec11-a7b5-000d3abd2e7a',
      'interventiontype.progres_description': 'BIA',
      'individuals.progres_id': '803-100000519',
      'individuals.progres_givenname': 'Given E',
      'individuals.progres_familyname': 'Family E',
      'individuals.progres_dateofbirth': '2020-01-01T00:00:00Z',
      'individuals.progres_sex': '125080000',
      'individuals.progres_registrationgroupid': {
        Id: '7151f700-19a6-ed11-aad1-000d3aaca11b',
        Name: '803-23-1000552',
        LogicalName: 'progres_registrationgroup',
        KeyAttributes: [],
        RowVersion: null,
      },
      'childprotection.progres_priority': '125080000',
      'user.internalemailaddress': 'pTestUser61@unhcr.org',
      direction: 'outgoing',
      decision_status: null,
      delivery_status: null,
    },
    {
      progres_interventionnumber: 'NAI-20-PRTITV-0000011',
      progres_lpinterventionid: '9f2a1c34-5b77-4d2e-9a10-6c0f2b8e4d11',
      progres_interventiontype2: '124d0594-77a1-ea11-8105-00155d680582',
      progres_interventionstartdate: '2021-05-04T00:00:00Z',
      progres_businessowner: '54aff07f-e8d5-ec11-a7b5-000d3abd2e7a',
      'interventiontype.progres_description': 'Legal Assistance Service',
      'individuals.progres_id': '803-100000527',
      'individuals.progres_givenname': 'Given F',
      'individuals.progres_familyname': 'Family F',
      'individuals.progres_dateofbirth': '2009-07-14T00:00:00Z',
      'individuals.progres_sex': '125080001',
      'user.internalemailaddress': 'pTestUser61@unhcr.org',
      direction: 'outgoing',
      decision_status: null,
      delivery_status: null,
    },
  ];
  for (const i of interventions) store.create('interventions', i.progres_interventionnumber, i);

  store.create('referrals', '9c506517-96c8-48e7-8fad-bb9711707174', {
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
    name_nickname: 'Saffa',
    date_of_birth: '2008-01-25',
    sex: 'female',
    address_current: 'Camp A',
    telephone_current: '+10000000000',
    protection_concerns: 'CR-AF',
    protection_concerns_other: null,
    language: 'English',
    risk_level: 'Normal',
    progres_interventionnumber: 'NAI-20-PRTITV-0000001',
    received_at: '2021-04-28T19:35:02.000Z',
  });
}
