import type { SystemGuide } from '../types.js';

/**
 * Sandbox guide for the ghana-nia system: its blurb and the runnable example
 * requests shown on the sandbox "API" tab. Referenced by usage examples' `apiRef`
 * cross-links.
 */
export const guide: SystemGuide = {
  title: 'Ghana NIA (National Identification Authority)',
  docs: 'https://docs.openfn.org/adaptors/packages/ghana-nia-docs',
  blurb:
    'Newborn identity registration. Posts to the AWOPA baby-registration API to mint a Ghana Card PIN; sends an NIa_merchantKey header and appends merchantKey to the body. registerChild → POST /awopa/api/v1/baby/registration, answering { data: { babyPin, voucherPin, ... }, success: true, code: "00" }.',
  auth: 'API key (NIa_merchantKey header)',
  examples: [
    {
      id: 'register',
      method: 'POST',
      path: '/awopa/api/v1/baby/registration',
      label: 'Register a child / mint a Ghana Card PIN (registerChild)',
      body: JSON.stringify(
        {
          babyData: { forenames: 'Kharis', surname: 'Osei', gender: 'Female', dateOfBirth: '2024-03-05', lightwaveETrackerID: '00313180/24-03' },
          personVouching: { ghanaCardPIN: 'GHA-001097272-4', relationToBaby: 'Mother' },
        },
        null,
        2
      ),
    },
    { id: 'list', method: 'GET', path: '/awopa/api/v1/baby/registration', label: 'List minted registrations' },
    { id: 'read', method: 'GET', path: '/awopa/api/v1/baby/registration/GHA-001097272-1', label: 'Look up a registration by baby PIN' },
  ],
};
